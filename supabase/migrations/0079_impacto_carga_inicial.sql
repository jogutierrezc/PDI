-- =============================================================================
-- PDI · 0079 · Carga inicial del catálogo de Impacto
--
-- Los 105 indicadores con los que las vicerrectorías capturan hoy (herramienta
-- SIE-CMI, matriz UDES vr7): 37 de Investigación, 26 de Enseñanza y 42 de
-- Extensión, publicados y a nombre de su vicerrectoría (VI, VE, VEX).
--
-- Van también:
--   · las dimensiones, con las reclasificaciones que Planeación ya había hecho
--     (asociaciones interpretativas) y las referencias cruzadas que cierran
--     cada cadena;
--   · las líneas base 2023 reales de Enseñanza verificadas contra la vr7;
--   · la correspondencia CESU (Acuerdo 01/2025) de los 33 impactos reales;
--   · los pilares y ODS que la matriz ya asignaba, como cruces confirmados de
--     origen «matriz».
--
-- Los indicadores I37, E23 y X38 son el nodo transversal de las tres
-- funciones: quedan sin dimensión a propósito.
--
-- Generado desde Impacto/herramienta_impacto.html. Requiere 0078. Idempotente:
-- lo que ya existe (mismo código) no se toca.
-- =============================================================================

-- 1. Dimensiones
insert into public.imp_dimensions (fn, name, position) values ('investigacion', 'Formación investigativa', 0) on conflict (fn, name) do nothing;
insert into public.imp_dimensions (fn, name, position) values ('investigacion', 'Investigación, creación e innovación', 1) on conflict (fn, name) do nothing;
insert into public.imp_dimensions (fn, name, position) values ('investigacion', 'Apropiación social del conocimiento', 2) on conflict (fn, name) do nothing;
insert into public.imp_dimensions (fn, name, position) values ('ensenanza', 'Práctica Profesional', 0) on conflict (fn, name) do nothing;
insert into public.imp_dimensions (fn, name, position) values ('ensenanza', 'Permanencia', 1) on conflict (fn, name) do nothing;
insert into public.imp_dimensions (fn, name, position) values ('ensenanza', 'Experiencia del Estudiante', 2) on conflict (fn, name) do nothing;
insert into public.imp_dimensions (fn, name, position) values ('ensenanza', 'Aprendizaje', 3) on conflict (fn, name) do nothing;
insert into public.imp_dimensions (fn, name, position) values ('extension', 'Institucional Formativo', 0) on conflict (fn, name) do nothing;
insert into public.imp_dimensions (fn, name, position) values ('extension', 'Mesosocial Intersectorial', 1) on conflict (fn, name) do nothing;
insert into public.imp_dimensions (fn, name, position) values ('extension', 'Microsocial Territorial', 2) on conflict (fn, name) do nothing;
insert into public.imp_dimensions (fn, name, position) values ('extension', 'Macrosocial Contextual', 3) on conflict (fn, name) do nothing;

-- 2. Fichas
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I01', 'investigacion', 'insumos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Formación investigativa'), u.id,
       'Estudiantes vinculados a semilleros', 'Registro de estudiantes activos en semilleros', 'Número', 'numero', '', null,
       '', null, '', null,
       'SIGIIP', 'VI', 'Pr1: Transformación curricular Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Cuantificar los recursos y condiciones de partida disponibles en relación con «Estudiantes vinculados a semilleros», dentro de la dimensión ''Formación Investigativa'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Registro de estudiantes activos en semilleros. Unidad de medida: Número. Fuente de datos: SIGIIP.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 0
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I02', 'investigacion', 'insumos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Formación investigativa'), u.id,
       'Estudiantes vinculados a Proyectos', 'Registro de estudiantes participando en proyectos de investigación / Número de trabajos de grado en los diferentes niveles de formación en modalidad de investigación', 'Número', 'numero', '', null,
       '', null, '', null,
       'SIGIIP', 'VI', 'Pr1: Transformación curricular Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Cuantificar los recursos y condiciones de partida disponibles en relación con «Estudiantes vinculados a Proyectos», dentro de la dimensión ''Formación Investigativa'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Registro de estudiantes participando en proyectos de investigación / Número de trabajos de grado en los diferentes niveles de formación en modalidad de investigación. Unidad de medida: Número. Fuente de datos: SIGIIP.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 1
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I03', 'investigacion', 'insumos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Formación investigativa'), u.id,
       'Profesores en actividades de formación investigativa', 'Profesores realizando cursos de investigación, maestrías de investigación o doctorados / Profesores que dirigen o tutorean trabajos de grado en modalidad de investigación', 'Número', 'numero', '', null,
       '', null, '', null,
       'MASTER/SIGIIP', 'VI', 'Pr1: Transformación curricular Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Cuantificar los recursos y condiciones de partida disponibles en relación con «Profesores en actividades de formación investigativa», dentro de la dimensión ''Capacidad Investigativa Institucional'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Profesores realizando cursos de investigación, maestrías de investigación o doctorados / Profesores que dirigen o tutorean trabajos de grado en modalidad de investigación. Unidad de medida: Número. Fuente de datos: MASTER/SIGIIP.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 2
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I04', 'investigacion', 'insumos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Profesores en actividades de investigación', 'Registro de profesores con actividades de investigación en su plan de trabajo', 'Número', 'numero', '', null,
       '', null, '', null,
       'MASTER', 'VI', 'Pr4: Universidad creativa y emprendedora Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Cuantificar los recursos y condiciones de partida disponibles en relación con «Profesores en actividades de investigación», dentro de la dimensión ''Capacidad Investigativa Institucional'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Registro de profesores con actividades de investigación en su plan de trabajo. Unidad de medida: Número. Fuente de datos: MASTER.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 3
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I05', 'investigacion', 'insumos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Formación investigativa'), u.id,
       'Semilleros de investigación activos', 'Semilleros de investigación formalizados y avalados en la VI', 'Número', 'numero', '', null,
       '', null, '', null,
       'SIGIIP', 'VI', 'Pr1: Transformación curricular Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Cuantificar los recursos y condiciones de partida disponibles en relación con «Semilleros de investigación activos», dentro de la dimensión ''Formación Investigativa'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Semilleros de investigación formalizados y avalados en la VI. Unidad de medida: Número. Fuente de datos: SIGIIP.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 4
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I06', 'investigacion', 'insumos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Grupos de investigación activos', 'Grupos de investigación avalados por la UDES', 'Número', 'numero', '', null,
       '', null, '', null,
       'INSTITULAC-UDES', 'VI', 'Pr4: Universidad creativa y emprendedora Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Cuantificar los recursos y condiciones de partida disponibles en relación con «Grupos de investigación activos», dentro de la dimensión ''Capacidad Investigativa Institucional'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Grupos de investigación avalados por la UDES. Unidad de medida: Número. Fuente de datos: INSTITULAC-UDES.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 5
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I07', 'investigacion', 'insumos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Presupuesto UDES para Actividades de Ciencia, Tecnología e Innovación (ACTI)', 'Presupuesto anual de actividades de investigación (investigación, desarrollo experimental, formación investigativa, servicios técnicos derivados de investigación)', 'Pesos/año', 'pesos', '', null,
       '', null, '', null,
       'VAF', 'VI', 'Pr2: Modernización y flexibilidad administrativa institucional Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Cuantificar los recursos y condiciones de partida disponibles en relación con «Presupuesto UDES para Actividades de Ciencia, Tecnología e Innovación (ACTI)», dentro de la dimensión ''Capacidad Investigativa Institucional'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Presupuesto anual de actividades de investigación (investigación, desarrollo experimental, formación investigativa, servicios técnicos derivados de investigación). Unidad de medida: Pesos/año. Fuente de datos: VAF.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual.","notaMetodologica":"Punto abierto (pendiente de definición por la Vicerrectoría de Investigación y la VAF): aclarar si el presupuesto que se reporta corresponde solo a recursos en efectivo o a la totalidad del presupuesto, incluyendo recursos en especie y en efectivo. Mientras tanto, se recomienda indicar en el campo de evidencia el criterio utilizado.","fichaBorrador":true}'::jsonb, 'publicado', 6
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I08', 'investigacion', 'insumos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Formación investigativa'), u.id,
       'Tasa de Inserción Científica Avanzada', '(N° Est. Posgrado Co-investigadores / N° Total Est.Posgrado activos) × 100', 'Porcentaje', 'porcentaje', '', null,
       '', null, '', null,
       'SIGIIP', 'VI', 'Pr1: Transformación curricular Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Cuantificar los recursos y condiciones de partida disponibles en relación con «Tasa de Inserción Científica Avanzada», dentro de la dimensión ''Formación Investigativa'' de la función de Investigación.","metodoCalculo":"Fórmula de cálculo: (N° Est. Posgrado Co-investigadores / N° Total Est.Posgrado activos) × 100. Unidad de medida: Porcentaje. Fuente de datos: SIGIIP.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 7
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I09', 'investigacion', 'insumos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Efectividad en Propiedad Intelectual', 'Patentes, registros de software o secretos industriales derivados de tesis de posgrado. Impacto en Guías Clínicas: Protocolos u hojas de ruta modificadas en hospitales por residentes médicos.', 'Número o proporción', 'dual', '', null,
       '', null, '', null,
       'SIGIIP / Sistema de Propiedad Intelectual', 'VI', 'Pr2: Modernización y flexibilidad administrativa institucional Pr4: Universidad creativa y emprendedora Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Cuantificar los recursos y condiciones de partida disponibles en relación con «Efectividad en Propiedad Intelectual», dentro de la dimensión ''Capacidad Investigativa Institucional'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Patentes, registros de software o secretos industriales derivados de tesis de posgrado. Impacto en Guías Clínicas: Protocolos u hojas de ruta modificadas en hospitales por residentes médicos. Unidad de medida: Número o proporción. Fuente de datos: SIGIIP / Sistema de Propiedad Intelectual.","interpretacion":"Puede registrarse como número, como proporción frente a un universo de referencia, o ambos, según lo que requiera la evaluación; conviene reportar también el número cuando la proporción pueda ocultar el tamaño real. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 8
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I10', 'investigacion', 'procesos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Proyectos formulados/presentados a convocatorias internas', 'Proporción de proyectos presentados a convocatorias INTERNAS en relación con el número de proyectos formulados en el Banco de Proyectos', 'Número o proporción', 'dual', '', null,
       '', null, '', null,
       'SIGIIP', 'VI', 'Pr4: Universidad creativa y emprendedora Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Proyectos formulados/presentados a convocatorias internas», dentro de la dimensión ''Gestión de la Investigación'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Proporción de proyectos presentados a convocatorias INTERNAS en relación con el número de proyectos formulados en el Banco de Proyectos. Unidad de medida: Número o proporción. Fuente de datos: SIGIIP.","interpretacion":"Puede registrarse como número, como proporción frente a un universo de referencia, o ambos, según lo que requiera la evaluación; conviene reportar también el número cuando la proporción pueda ocultar el tamaño real. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true,"asociacionInterpretativa":"Reclasificado: se asocia mejor con los productos de nuevo conocimiento que genera la convocatoria, no solo con su gestión."}'::jsonb, 'publicado', 9
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I11', 'investigacion', 'procesos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Proyectos formulados/presentados a convocatorias externas', 'Proporción de proyectos presentados a convocatorias EXTERNAS en relación con el número de proyectos formulados en el Banco de Proyectos', 'Número o proporción', 'dual', '', null,
       '', null, '', null,
       'SIGIIP', 'VI', 'Pr4: Universidad creativa y emprendedora Pr6: Impacto social integrando la enseñanza, investigación y extensión Pr7: UDES: universidad, empresa, estado, comunidad y sociedad civil', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Proyectos formulados/presentados a convocatorias externas», dentro de la dimensión ''Gestión de la Investigación'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Proporción de proyectos presentados a convocatorias EXTERNAS en relación con el número de proyectos formulados en el Banco de Proyectos. Unidad de medida: Número o proporción. Fuente de datos: SIGIIP.","interpretacion":"Puede registrarse como número, como proporción frente a un universo de referencia, o ambos, según lo que requiera la evaluación; conviene reportar también el número cuando la proporción pueda ocultar el tamaño real. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true,"asociacionInterpretativa":"Reclasificado: se asocia mejor con los productos de nuevo conocimiento que genera la convocatoria, no solo con su gestión."}'::jsonb, 'publicado', 10
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I12', 'investigacion', 'procesos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Proyectos formulados/presentados en colaboración internacional', 'Proporción de proyectos presentados en colaboración en relación con el número de proyectos formulados en el Banco de Proyectos', 'Número o proporción', 'dual', '', null,
       '', null, '', null,
       'SIGIIP', 'VI', 'Pr4: Universidad creativa y emprendedora Pr6: Impacto social integrando la enseñanza, investigación y extensión Pr7: UDES: universidad, empresa, estado, comunidad y sociedad civil', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Proyectos formulados/presentados en colaboración internacional», dentro de la dimensión ''Gestión de la Investigación'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Proporción de proyectos presentados en colaboración en relación con el número de proyectos formulados en el Banco de Proyectos. Unidad de medida: Número o proporción. Fuente de datos: SIGIIP.","interpretacion":"Puede registrarse como número, como proporción frente a un universo de referencia, o ambos, según lo que requiera la evaluación; conviene reportar también el número cuando la proporción pueda ocultar el tamaño real. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true,"asociacionInterpretativa":"Reclasificado: se asocia mejor con los productos de nuevo conocimiento que genera la convocatoria, no solo con su gestión."}'::jsonb, 'publicado', 11
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I13', 'investigacion', 'procesos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Formación investigativa'), u.id,
       'Estudiantes de semillero reconocidos en eventos de investigación', 'Proporción de estudiantes que logran reconocimiento en eventos institucionales, departamentales, nacionales e internacionales de Red Colsi u otras organizaciones académicas', 'Número o proporción', 'dual', '', null,
       '', null, '', null,
       'Coordinación de Grupos y Semilleros VI', 'VI', 'Pr1: Transformación curricular Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Estudiantes de semillero reconocidos en eventos de investigación», dentro de la dimensión ''Formación Investigativa'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Proporción de estudiantes que logran reconocimiento en eventos institucionales, departamentales, nacionales e internacionales de Red Colsi u otras organizaciones académicas. Unidad de medida: Número o proporción. Fuente de datos: Coordinación de Grupos y Semilleros VI.","interpretacion":"Puede registrarse como número, como proporción frente a un universo de referencia, o ambos, según lo que requiera la evaluación; conviene reportar también el número cuando la proporción pueda ocultar el tamaño real. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 12
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I14', 'investigacion', 'procesos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Formación investigativa'), u.id,
       'Jóvenes investigadores en formación', 'Jóvenes investigadores en formación en ambientes de investigación UDES', 'Número', 'numero', '', null,
       '', null, '', null,
       'VI', 'VI', 'Pr1: Transformación curricular Pr4: Universidad creativa y emprendedora Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Jóvenes investigadores en formación», dentro de la dimensión ''Formación Investigativa'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Jóvenes investigadores en formación en ambientes de investigación UDES. Unidad de medida: Número. Fuente de datos: VI.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 13
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I15', 'investigacion', 'procesos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Profesores reconocidos y categorizados ante MinCiencias', 'Proporción de profesores categorizados en MinCiencias como Investigadores Junior, Asociado, Senior o Emérito en convocatoria MinCiencias', 'Número o proporción', 'dual', '', null,
       '', null, '', null,
       'INSTITULAC-UDES', 'VI', 'Pr4: Universidad creativa y emprendedora Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Profesores reconocidos y categorizados ante MinCiencias», dentro de la dimensión ''Capacidad Investigativa Institucional'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Proporción de profesores categorizados en MinCiencias como Investigadores Junior, Asociado, Senior o Emérito en convocatoria MinCiencias. Unidad de medida: Número o proporción. Fuente de datos: INSTITULAC-UDES.","interpretacion":"Puede registrarse como número, como proporción frente a un universo de referencia, o ambos, según lo que requiera la evaluación; conviene reportar también el número cuando la proporción pueda ocultar el tamaño real. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 14
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I16', 'investigacion', 'procesos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Grupos reconocidos y categorizados ante MinCiencias en A1 y A', 'Proporción de grupos categorizados en A1 y A en convocatoria MinCiencias', 'Número o proporción', 'dual', '', null,
       '', null, '', null,
       'INSTITULAC-UDES', 'VI', 'Pr3: Gobierno Institucional y transparencia Pr4: Universidad creativa y emprendedora Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Grupos reconocidos y categorizados ante MinCiencias en A1 y A», dentro de la dimensión ''Capacidad Investigativa Institucional'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Proporción de grupos categorizados en A1 y A en convocatoria MinCiencias. Unidad de medida: Número o proporción. Fuente de datos: INSTITULAC-UDES.","interpretacion":"Puede registrarse como número, como proporción frente a un universo de referencia, o ambos, según lo que requiera la evaluación; conviene reportar también el número cuando la proporción pueda ocultar el tamaño real. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 15
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I17', 'investigacion', 'procesos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Índice de proyectos consolidados de alto impacto soportados en infraestructura científica y tecnológica', '(N° de proyectos finalizados con impacto verificado en el sector externo que requirieron el uso crítico de infraestructura UDES / Total de proyectos finalizados que utilizaron la infraestructura en el periodo t) × 100', 'Porcentaje', 'porcentaje', '', null,
       '', null, '', null,
       'SIGIIP', 'VI', 'Pr2: Modernización y flexibilidad administrativa institucional Pr4: Universidad creativa y emprendedora Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Índice de proyectos consolidados de alto impacto soportados en infraestructura científica y tecnológica», dentro de la dimensión ''Gestión de la Investigación'' de la función de Investigación.","metodoCalculo":"Fórmula de cálculo: (N° de proyectos finalizados con impacto verificado en el sector externo que requirieron el uso crítico de infraestructura UDES / Total de proyectos finalizados que utilizaron la infraestructura en el periodo t) × 100. Unidad de medida: Porcentaje. Fuente de datos: SIGIIP.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","notaConceptual":"El criterio de ''uso crítico de infraestructura UDES'' que determina qué proyectos se cuentan en el numerador no tiene todavía un umbral objetivo definido (por ejemplo, horas mínimas de uso o nivel de dependencia del proyecto respecto al recurso); pendiente de que la Vicerrectoría de Investigación lo precise. Propuesta de definiciones (borrador, pendiente de validación por la Vicerrectoría de Investigación): «proyecto de alto impacto» es un proyecto finalizado cuyos resultados cuentan con evidencia verificable de uso o efecto en el sector externo (empresa, comunidad, entidad pública o política), según se exige en el numerador; «uso crítico de infraestructura» es aquel sin el cual el proyecto no habría podido ejecutarse o alcanzar sus resultados, y debe soportarse con el registro de uso de la infraestructura en SIGIIP.","fichaBorrador":true,"asociacionInterpretativa":"Reclasificado: se asocia mejor con los productos de nuevo conocimiento que genera la convocatoria, no solo con su gestión."}'::jsonb, 'publicado', 16
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I18', 'investigacion', 'productos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Proyectos en ejecución/ejecutados en convocatorias internas', 'Número y proporción de proyectos en ejecución/ejecutados en relación con los proyectos presentados en convocatorias INTERNAS', 'Número o proporción', 'dual', '', null,
       '', null, '', null,
       'SIGIIP', 'VI', 'Pr4: Universidad creativa y emprendedora Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Proyectos en ejecución/ejecutados en convocatorias internas», dentro de la dimensión ''Nuevo Conocimiento'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Número y proporción de proyectos en ejecución/ejecutados en relación con los proyectos presentados en convocatorias INTERNAS. Unidad de medida: Número o proporción. Fuente de datos: SIGIIP.","interpretacion":"Puede registrarse como número, como proporción frente a un universo de referencia, o ambos, según lo que requiera la evaluación; conviene reportar también el número cuando la proporción pueda ocultar el tamaño real. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 17
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I19', 'investigacion', 'productos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Proyectos en ejecución/ejecutados en convocatorias externas', 'Número y proporción de proyectos en ejecución/ejecutados en relación con los proyectos presentados en convocatorias EXTERNAS', 'Número o proporción', 'dual', '', null,
       '', null, '', null,
       'SIGIIP', 'VI', 'Pr4: Universidad creativa y emprendedora Pr7: UDES: universidad, empresa, estado, comunidad y sociedad civil Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Proyectos en ejecución/ejecutados en convocatorias externas», dentro de la dimensión ''Nuevo Conocimiento'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Número y proporción de proyectos en ejecución/ejecutados en relación con los proyectos presentados en convocatorias EXTERNAS. Unidad de medida: Número o proporción. Fuente de datos: SIGIIP.","interpretacion":"Puede registrarse como número, como proporción frente a un universo de referencia, o ambos, según lo que requiera la evaluación; conviene reportar también el número cuando la proporción pueda ocultar el tamaño real. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 18
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I20', 'investigacion', 'productos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Proyectos en ejecución/ejecutados en colaboración interinstitucional/internacional/Intersectorial', 'Número y proporción de proyectos en ejecución/ejecutados en relación con los proyectos presentados en convocatorias de COLABORACIÓN interinstitucional/internacional/intersectorial', 'Número o proporción', 'dual', '', null,
       '', null, '', null,
       'SIGIIP / DRNI', 'VI', 'Pr4: Universidad creativa y emprendedora Pr7: UDES: universidad, empresa, estado, comunidad y sociedad civil Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Proyectos en ejecución/ejecutados en colaboración interinstitucional/internacional/Intersectorial», dentro de la dimensión ''Nuevo Conocimiento'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Número y proporción de proyectos en ejecución/ejecutados en relación con los proyectos presentados en convocatorias de COLABORACIÓN interinstitucional/internacional/intersectorial. Unidad de medida: Número o proporción. Fuente de datos: SIGIIP / DRNI.","interpretacion":"Puede registrarse como número, como proporción frente a un universo de referencia, o ambos, según lo que requiera la evaluación; conviene reportar también el número cuando la proporción pueda ocultar el tamaño real. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 19
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I21', 'investigacion', 'productos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Productos de nuevo conocimiento derivado de la ejecución de proyectos UDES', 'Número de artículos científicos, desarrollos experimentales, capítulos de libro, libros derivados de investigación en relación con los proyectos ejecutados', 'Número o proporción', 'dual', '', null,
       '', null, '', null,
       'SIGIIP', 'VI', 'Pr4: Universidad creativa y emprendedora Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Productos de nuevo conocimiento derivado de la ejecución de proyectos UDES», dentro de la dimensión ''Nuevo Conocimiento'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Número de artículos científicos, desarrollos experimentales, capítulos de libro, libros derivados de investigación en relación con los proyectos ejecutados. Unidad de medida: Número o proporción. Fuente de datos: SIGIIP.","interpretacion":"Puede registrarse como número, como proporción frente a un universo de referencia, o ambos, según lo que requiera la evaluación; conviene reportar también el número cuando la proporción pueda ocultar el tamaño real. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 20
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I22', 'investigacion', 'productos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Apropiación social del conocimiento'), u.id,
       'Productos de Apropiación social del conocimiento derivados de la ejecución de proyectos UDES', 'Número y proporción de eventos científicos, material de divulgación de resultados, actividades de socialización a autoridades gubernamentales, comunidades y públicos de interés, conformación y participación en redes de conocimiento.', 'Número o proporción', 'dual', '', null,
       '', null, '', null,
       'SIGIIP', 'VI', 'Pr6: Impacto social integrando la enseñanza, investigación y extensión Pr7: UDES: universidad, empresa, estado, comunidad y sociedad civil', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Productos de Apropiación social del conocimiento derivados de la ejecución de proyectos UDES», dentro de la dimensión ''Apropiación Social del Conocimiento'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Número y proporción de eventos científicos, material de divulgación de resultados, actividades de socialización a autoridades gubernamentales, comunidades y públicos de interés, conformación y participación en redes de conocimiento. Unidad de medida: Número o proporción. Fuente de datos: SIGIIP.","interpretacion":"Puede registrarse como número, como proporción frente a un universo de referencia, o ambos, según lo que requiera la evaluación; conviene reportar también el número cuando la proporción pueda ocultar el tamaño real. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 21
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I23', 'investigacion', 'productos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Formación investigativa'), u.id,
       'Productos de formación en investigación de alto nivel (Maestrías/Doctorados) derivados de la ejecución de proyectos UDES', 'Número y proporción de magísteres (en investigación) y doctores formados', 'Número o proporción', 'dual', '', null,
       '', null, '', null,
       'SIGIIP', 'VI', 'Pr1: Transformación curricular Pr4: Universidad creativa y emprendedora Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Productos de formación en investigación de alto nivel (Maestrías/Doctorados) derivados de la ejecución de proyectos UDES», dentro de la dimensión ''Formación Investigativa'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Número y proporción de magísteres (en investigación) y doctores formados. Unidad de medida: Número o proporción. Fuente de datos: SIGIIP.","interpretacion":"Puede registrarse como número, como proporción frente a un universo de referencia, o ambos, según lo que requiera la evaluación; conviene reportar también el número cuando la proporción pueda ocultar el tamaño real. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 22
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I24', 'investigacion', 'productos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Apropiación social del conocimiento'), u.id,
       'Productos de creación artística/cultural derivados de la ejecución de proyectos UDES', 'Número y proporción de obras, diseños y procesos de nuevo conocimiento, que impliquen aportes nuevos originales e inéditos al arte, a la arquitectura, al diseño, a la cultura y al conocimiento en general', 'Número o proporción', 'dual', '', null,
       '', null, '', null,
       'SIGIIP', 'VI', 'Pr1: Transformación curricular Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Productos de creación artística/cultural derivados de la ejecución de proyectos UDES», dentro de la dimensión ''Apropiación Social del Conocimiento'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Número y proporción de obras, diseños y procesos de nuevo conocimiento, que impliquen aportes nuevos originales e inéditos al arte, a la arquitectura, al diseño, a la cultura y al conocimiento en general. Unidad de medida: Número o proporción. Fuente de datos: SIGIIP.","interpretacion":"Puede registrarse como número, como proporción frente a un universo de referencia, o ambos, según lo que requiera la evaluación; conviene reportar también el número cuando la proporción pueda ocultar el tamaño real. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 23
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I25', 'investigacion', 'productos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Servicios y consultorías derivados de la ejecución de proyectos UDES', 'Número y proporción de servicios y consultorías técnicas y científicas desarrolladas tanto al interior de la UDES como en el sector productivo', 'Número o proporción', 'dual', '', null,
       '', null, '', null,
       'SIGIIP / Vicerrectoría de Extensión', 'VI', 'Pr4: Universidad creativa y emprendedora Pr6: Impacto social integrando la enseñanza, investigación y extensión Pr7: UDES: universidad, empresa, estado, comunidad y sociedad civil', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Servicios y consultorías derivados de la ejecución de proyectos UDES», dentro de la dimensión ''Transferencia y Uso del Conocimiento'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Número y proporción de servicios y consultorías técnicas y científicas desarrolladas tanto al interior de la UDES como en el sector productivo. Unidad de medida: Número o proporción. Fuente de datos: SIGIIP / Vicerrectoría de Extensión.","interpretacion":"Puede registrarse como número, como proporción frente a un universo de referencia, o ambos, según lo que requiera la evaluación; conviene reportar también el número cuando la proporción pueda ocultar el tamaño real. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true,"asociacionInterpretativa":"Transferencia y Uso del Conocimiento se integra dentro de Investigación, creación e innovación (modelo abril 2026)."}'::jsonb, 'publicado', 24
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I26', 'investigacion', 'productos', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Productos de desarrollo tecnológico derivados de la ejecución de proyectos UDES', 'Número y proporción de productos tecnológicos validados y certificados, productos empresariales, regulaciones, normas, reglamentos o legislaciones, así como conceptos e informes técnicos derivados de la ejecución de proyectos UDES.', 'Número o proporción', 'dual', '', null,
       '', null, '', null,
       'SIGIIP / Vicerrectoría de Extensión', 'VI', 'Pr4: Universidad creativa y emprendedora Pr6: Impacto social integrando la enseñanza, investigación y extensión Pr7: UDES: universidad, empresa, estado, comunidad y sociedad civil', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Productos de desarrollo tecnológico derivados de la ejecución de proyectos UDES», dentro de la dimensión ''Transferencia y Uso del Conocimiento'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Número y proporción de productos tecnológicos validados y certificados, productos empresariales, regulaciones, normas, reglamentos o legislaciones, así como conceptos e informes técnicos derivados de la ejecución de proyectos UDES. Unidad de medida: Número o proporción. Fuente de datos: SIGIIP / Vicerrectoría de Extensión.","interpretacion":"Puede registrarse como número, como proporción frente a un universo de referencia, o ambos, según lo que requiera la evaluación; conviene reportar también el número cuando la proporción pueda ocultar el tamaño real. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true,"asociacionInterpretativa":"Transferencia y Uso del Conocimiento se integra dentro de Investigación, creación e innovación (modelo abril 2026)."}'::jsonb, 'publicado', 25
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I27', 'investigacion', 'impacto', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Formación investigativa'), u.id,
       'Graduados UDES que participaron en semilleros de investigación o programa de jóvenes investigadores vinculados al SNCTI', 'Proporción de graduados UDES que participaron en semilleros de investigación o programa de jóvenes investigadores que se encuentran vinculados al SNCTI en la ventana de 2 o más años posteriores a su egreso', 'Proporción', 'proporcion', '', null,
       '', null, '', null,
       'VI', 'VI', 'Pr1: Transformación curricular Pr6: Impacto social integrando la enseñanza, investigación y extensión', array['C22', 'C39', 'C40']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Graduados UDES que participaron en semilleros de investigación o programa de jóvenes investigadores vinculados al SNCTI», dentro de la dimensión ''Impacto en Trayectorias de Vida'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Proporción de graduados UDES que participaron en semilleros de investigación o programa de jóvenes investigadores que se encuentran vinculados al SNCTI en la ventana de 2 o más años posteriores a su egreso. Unidad de medida: Proporción. Fuente de datos: VI.","interpretacion":"Se expresa como proporción frente a un universo de referencia. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Formación Investigativa'' (reclasificado desde la dimensión oficial ''Impacto en Trayectorias de Vida'': Mide el efecto de semilleros/jóvenes investigadores, la misma actividad que Formación Investigativa ya cubre en Insumos/Procesos/Productos.): I01 – Estudiantes vinculados a semilleros (Insumos); I02 – Estudiantes vinculados a Proyectos (Insumos); I05 – Semilleros de investigación activos (Insumos); I08 – Tasa de Inserción Científica Avanzada (Insumos); I13 – Estudiantes de semillero reconocidos en eventos de investigación (Procesos); I14 – Jóvenes investigadores en formación (Procesos); I23 – Productos de formación en investigación de alto nivel (Maestrías/Doctorados) derivados de la ejecución de proyectos UDES (Productos).","fichaBorrador":true,"asociacionInterpretativa":"Mide el efecto de semilleros/jóvenes investigadores, la misma actividad que Formación investigativa ya cubre en Insumos/Procesos/Productos."}'::jsonb, 'publicado', 26
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I28', 'investigacion', 'impacto', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Productos de I+D+i+c que aportan a los focos de investigación UDES (Salud Planetaria, Seguridad Alimentaria, Transición energética)', 'Proporción de productos (en todas sus tipologías del modelo de reconocimiento MinCiencias) que aportan a los focos con respecto al número total de productos I+D+i+c en la misma ventana de tiempo analizada.', 'Proporción', 'proporcion', '', null,
       '', null, '', null,
       'VI', 'VI', 'Pr5: Cultura universitaria de sostenibilidad Pr6: Impacto social integrando la enseñanza, investigación y extensión', array['C22', 'C23']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Productos de I+D+i+c que aportan a los focos de investigación UDES (Salud Planetaria, Seguridad Alimentaria, Transición energética)», dentro de la dimensión ''Impacto Social y Territorial'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Proporción de productos (en todas sus tipologías del modelo de reconocimiento MinCiencias) que aportan a los focos con respecto al número total de productos I+D+i+c en la misma ventana de tiempo analizada. Unidad de medida: Proporción. Fuente de datos: VI.","interpretacion":"Se expresa como proporción frente a un universo de referencia. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Nuevo Conocimiento'' (reclasificado desde la dimensión oficial ''Impacto Social y Territorial'': Mide el efecto externo de los productos I+D+i+c que Nuevo Conocimiento ya produce en Productos.): I07 – Presupuesto UDES para Actividades de Ciencia, Tecnología e Innovación (ACTI) (Insumos); I10 – Proyectos formulados/presentados a convocatorias internas (Procesos); I11 – Proyectos formulados/presentados a convocatorias externas (Procesos); I12 – Proyectos formulados/presentados en colaboración internacional (Procesos); I17 – Índice de proyectos consolidados de alto impacto soportados en infraestructura científica y tecnológica (Procesos); I18 – Proyectos en ejecución/ejecutados en convocatorias internas (Productos); I19 – Proyectos en ejecución/ejecutados en convocatorias externas (Productos); I20 – Proyectos en ejecución/ejecutados en colaboración interinstitucional/internacional/Intersectorial (Productos); I21 – Productos de nuevo conocimiento derivado de la ejecución de proyectos UDES (Productos).","fichaBorrador":true,"asociacionInterpretativa":"Mide el efecto externo de los productos I+D+i+c que esta dimensión ya produce en Productos."}'::jsonb, 'publicado', 27
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I29', 'investigacion', 'impacto', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Productos de I+D+i+c transferidos a los sectores de aplicación (local, regional, nacional e internacional)', 'Proporción de productos que se han transferido a través de servicios, consultorías, licencias o capacitaciones al sector externo con respecto al número total de productos I+D+i+c en la misma ventana de tiempo analizada.', 'Proporción', 'proporcion', '', null,
       '', null, '', null,
       'VI', 'VI', 'Pr4: Universidad creativa y emprendedora Pr6: Impacto social integrando la enseñanza, investigación y extensión Pr7: UDES: universidad, empresa, estado, comunidad y sociedad civil', array['C22', 'C23', 'C26']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Productos de I+D+i+c transferidos a los sectores de aplicación (local, regional, nacional e internacional)», dentro de la dimensión ''Transferencia y Uso del Conocimiento'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Proporción de productos que se han transferido a través de servicios, consultorías, licencias o capacitaciones al sector externo con respecto al número total de productos I+D+i+c en la misma ventana de tiempo analizada. Unidad de medida: Proporción. Fuente de datos: VI.","interpretacion":"Se expresa como proporción frente a un universo de referencia. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Apropiación Social del Conocimiento'' (reclasificado desde la dimensión oficial ''Transferencia y Uso del Conocimiento'': Transferencia y Uso del Conocimiento queda implícita dentro de Apropiación Social del Conocimiento.): I09 – Efectividad en Propiedad Intelectual (Insumos); I17 – Índice de proyectos consolidados de alto impacto soportados en infraestructura científica y tecnológica (Procesos); I22 – Productos de Apropiación social del conocimiento derivados de la ejecución de proyectos UDES (Productos); I24 – Productos de creación artística/cultural derivados de la ejecución de proyectos UDES (Productos); I25 – Servicios y consultorías derivados de la ejecución de proyectos UDES (Productos); I26 – Productos de desarrollo tecnológico derivados de la ejecución de proyectos UDES (Productos).","fichaBorrador":true,"asociacionInterpretativa":"Transferencia y Uso del Conocimiento se integra dentro de Investigación, creación e innovación (modelo abril 2026)."}'::jsonb, 'publicado', 28
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I30', 'investigacion', 'impacto', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Políticas públicas que involucran o se sustentan en productos de I+D+i+c derivados de proyectos UDES', 'Políticas públicas a nivel local, regional, nacional e internacional que citan productos de I+D+i+c UDES', 'Número', 'numero', '', null,
       '', null, '', null,
       'VI', 'VI', 'Pr3: Gobierno Institucional y transparencia Pr6: Impacto social integrando la enseñanza, investigación y extensión', array['C22', 'C23', 'C26']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Políticas públicas que involucran o se sustentan en productos de I+D+i+c derivados de proyectos UDES», dentro de la dimensión ''Impacto Social y Territorial'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Políticas públicas a nivel local, regional, nacional e internacional que citan productos de I+D+i+c UDES. Unidad de medida: Número. Fuente de datos: VI.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Nuevo Conocimiento'' (reclasificado desde la dimensión oficial ''Impacto Social y Territorial'': Mide el efecto externo de los productos I+D+i+c que Nuevo Conocimiento ya produce en Productos.): I07 – Presupuesto UDES para Actividades de Ciencia, Tecnología e Innovación (ACTI) (Insumos); I10 – Proyectos formulados/presentados a convocatorias internas (Procesos); I11 – Proyectos formulados/presentados a convocatorias externas (Procesos); I12 – Proyectos formulados/presentados en colaboración internacional (Procesos); I17 – Índice de proyectos consolidados de alto impacto soportados en infraestructura científica y tecnológica (Procesos); I18 – Proyectos en ejecución/ejecutados en convocatorias internas (Productos); I19 – Proyectos en ejecución/ejecutados en convocatorias externas (Productos); I20 – Proyectos en ejecución/ejecutados en colaboración interinstitucional/internacional/Intersectorial (Productos); I21 – Productos de nuevo conocimiento derivado de la ejecución de proyectos UDES (Productos).","fichaBorrador":true,"asociacionInterpretativa":"Mide el efecto externo de los productos I+D+i+c que esta dimensión ya produce en Productos."}'::jsonb, 'publicado', 29
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I31', 'investigacion', 'impacto', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Métricas cienciométricas y posicionamiento en rankings', 'Índices, indicadores y posicionamientos en sistemas de rankings cienciométricos (Scimago, WoS, QS, THE, Google Scholar, entre otros)', 'Índices e indicadores específicos de los diferentes rankings y agencias cienciométricas', 'numero', '', null,
       '', null, '', null,
       'VI', 'VI', 'Pr3: Gobierno Institucional y transparencia Pr4: Universidad creativa y emprendedora Pr6: Impacto social integrando la enseñanza, investigación y extensión', array['C22', 'C26']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Métricas cienciométricas y posicionamiento en rankings», dentro de la dimensión ''Posicionamiento Institucional'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Índices, indicadores y posicionamientos en sistemas de rankings cienciométricos (Scimago, WoS, QS, THE, Google Scholar, entre otros). Unidad de medida: Índices e indicadores específicos de los diferentes rankings y agencias cienciométricas. Fuente de datos: VI.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Capacidad Investigativa Institucional'' (reclasificado desde la dimensión oficial ''Posicionamiento Institucional'': Rankings y liderazgo científico son la proyección externa de la capacidad instalada (profesores/grupos categorizados).): I03 – Profesores en actividades de formación investigativa (Insumos); I04 – Profesores en actividades de investigación (Insumos); I06 – Grupos de investigación activos (Insumos); I07 – Presupuesto UDES para Actividades de Ciencia, Tecnología e Innovación (ACTI) (Insumos); I09 – Efectividad en Propiedad Intelectual (Insumos); I15 – Profesores reconocidos y categorizados ante MinCiencias (Procesos); I16 – Grupos reconocidos y categorizados ante MinCiencias en A1 y A (Procesos); I21 – Productos de nuevo conocimiento derivado de la ejecución de proyectos UDES (Productos).","fichaBorrador":true,"asociacionInterpretativa":"Rankings y liderazgo científico son la proyección externa de la capacidad instalada (profesores/grupos categorizados)."}'::jsonb, 'publicado', 30
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I32', 'investigacion', 'impacto', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Productos de I+D+i+c que aportan a las metas de los ODS en Colombia, LAC y global', 'Número y proporción de productos de I+D+i+c derivados de proyectos UDES que evidencian aportes a los ODS en función de las metas establecidas para Colombia y el mundo', 'Número o proporción', 'dual', '', null,
       '', null, '', null,
       'VI', 'VI', 'Pr5: Cultura universitaria de sostenibilidad Pr6: Impacto social integrando la enseñanza, investigación y extensión', array['C22', 'C23', 'C24']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Productos de I+D+i+c que aportan a las metas de los ODS en Colombia, LAC y global», dentro de la dimensión ''Impacto Social y Territorial'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Número y proporción de productos de I+D+i+c derivados de proyectos UDES que evidencian aportes a los ODS en función de las metas establecidas para Colombia y el mundo. Unidad de medida: Número o proporción. Fuente de datos: VI.","interpretacion":"Puede registrarse como número, como proporción frente a un universo de referencia, o ambos, según lo que requiera la evaluación; conviene reportar también el número cuando la proporción pueda ocultar el tamaño real. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Nuevo Conocimiento'' (reclasificado desde la dimensión oficial ''Impacto Social y Territorial'': Mide el efecto externo de los productos I+D+i+c que Nuevo Conocimiento ya produce en Productos.): I07 – Presupuesto UDES para Actividades de Ciencia, Tecnología e Innovación (ACTI) (Insumos); I10 – Proyectos formulados/presentados a convocatorias internas (Procesos); I11 – Proyectos formulados/presentados a convocatorias externas (Procesos); I12 – Proyectos formulados/presentados en colaboración internacional (Procesos); I17 – Índice de proyectos consolidados de alto impacto soportados en infraestructura científica y tecnológica (Procesos); I18 – Proyectos en ejecución/ejecutados en convocatorias internas (Productos); I19 – Proyectos en ejecución/ejecutados en convocatorias externas (Productos); I20 – Proyectos en ejecución/ejecutados en colaboración interinstitucional/internacional/Intersectorial (Productos); I21 – Productos de nuevo conocimiento derivado de la ejecución de proyectos UDES (Productos).","fichaBorrador":true,"asociacionInterpretativa":"Mide el efecto externo de los productos I+D+i+c que esta dimensión ya produce en Productos."}'::jsonb, 'publicado', 31
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I33', 'investigacion', 'impacto', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Emprendimientos de base científica/tecnológica derivados de productos de I+D+i+c desarrollados en proyectos UDES', 'Número y proporción de empresas creadas de base científica o tecnológica, spin-offs, startups, o número de empresas ya constituidas que innovan con productos o servicios derivados de la investigación UDES', 'Número o proporción', 'dual', '', null,
       '', null, '', null,
       'VI', 'VI', 'Pr4: Universidad creativa y emprendedora Pr6: Impacto social integrando la enseñanza, investigación y extensión Pr7: UDES: universidad, empresa, estado, comunidad y sociedad civil', array['C22', 'C23']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Emprendimientos de base científica/tecnológica derivados de productos de I+D+i+c desarrollados en proyectos UDES», dentro de la dimensión ''Transferencia y Uso del Conocimiento'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Número y proporción de empresas creadas de base científica o tecnológica, spin-offs, startups, o número de empresas ya constituidas que innovan con productos o servicios derivados de la investigación UDES. Unidad de medida: Número o proporción. Fuente de datos: VI.","interpretacion":"Puede registrarse como número, como proporción frente a un universo de referencia, o ambos, según lo que requiera la evaluación; conviene reportar también el número cuando la proporción pueda ocultar el tamaño real. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Apropiación Social del Conocimiento'' (reclasificado desde la dimensión oficial ''Transferencia y Uso del Conocimiento'': Transferencia y Uso del Conocimiento queda implícita dentro de Apropiación Social del Conocimiento.): I09 – Efectividad en Propiedad Intelectual (Insumos); I17 – Índice de proyectos consolidados de alto impacto soportados en infraestructura científica y tecnológica (Procesos); I22 – Productos de Apropiación social del conocimiento derivados de la ejecución de proyectos UDES (Productos); I24 – Productos de creación artística/cultural derivados de la ejecución de proyectos UDES (Productos); I25 – Servicios y consultorías derivados de la ejecución de proyectos UDES (Productos); I26 – Productos de desarrollo tecnológico derivados de la ejecución de proyectos UDES (Productos).","fichaBorrador":true,"asociacionInterpretativa":"Transferencia y Uso del Conocimiento se integra dentro de Investigación, creación e innovación (modelo abril 2026)."}'::jsonb, 'publicado', 32
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I34', 'investigacion', 'impacto', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Formación investigativa'), u.id,
       'Desempeño académico de estudiantes en actividades de formación investigativa (semilleros y jóvenes investigadores)', 'Resultados de aprendizaje demostrados en pruebas de desempeño académico institucionales (CMIRA) y nacionales (SABER-PRO) de estudiantes que participaron en semilleros de investigación en relación con los que no participaron.', 'Resultados estandarizadossegún prueba', 'numero', '', null,
       '', null, '', null,
       'VI', 'VI', 'Pr1: Transformación curricular Pr4: Universidad creativa y emprendedora Pr6: Impacto social integrando la enseñanza, investigación y extensión', array[]::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Desempeño académico de estudiantes en actividades de formación investigativa (semilleros y jóvenes investigadores)», dentro de la dimensión ''Impacto en Trayectorias de Vida'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Resultados de aprendizaje demostrados en pruebas de desempeño académico institucionales (CMIRA) y nacionales (SABER-PRO) de estudiantes que participaron en semilleros de investigación en relación con los que no participaron. Unidad de medida: Resultados estandarizadossegún prueba. Fuente de datos: VI.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Formación Investigativa'' (reclasificado desde la dimensión oficial ''Impacto en Trayectorias de Vida'': Mide el efecto de semilleros/jóvenes investigadores, la misma actividad que Formación Investigativa ya cubre en Insumos/Procesos/Productos.): I01 – Estudiantes vinculados a semilleros (Insumos); I02 – Estudiantes vinculados a Proyectos (Insumos); I05 – Semilleros de investigación activos (Insumos); I08 – Tasa de Inserción Científica Avanzada (Insumos); I13 – Estudiantes de semillero reconocidos en eventos de investigación (Procesos); I14 – Jóvenes investigadores en formación (Procesos); I23 – Productos de formación en investigación de alto nivel (Maestrías/Doctorados) derivados de la ejecución de proyectos UDES (Productos).","fichaBorrador":true,"asociacionInterpretativa":"Mide el efecto de semilleros/jóvenes investigadores, la misma actividad que Formación investigativa ya cubre en Insumos/Procesos/Productos."}'::jsonb, 'publicado', 33
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I35', 'investigacion', 'impacto', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Formación investigativa'), u.id,
       'Desempeño profesional de graduados que participaron en actividades de formación investigativa (semilleros y jóvenes investigadores)', 'Desempeño profesional comparado de graduados que participaron en semilleros de investigación y jóvenes investigadores', 'Resultados evidenciados en estudios de graduados', 'numero', '', null,
       '', null, '', null,
       'VI', 'VI', 'Pr1: Transformación curricular Pr6: Impacto social integrando la enseñanza, investigación y extensión', array['C22', 'C39', 'C40']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Desempeño profesional de graduados que participaron en actividades de formación investigativa (semilleros y jóvenes investigadores)», dentro de la dimensión ''Impacto en Trayectorias de Vida'' de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Desempeño profesional comparado de graduados que participaron en semilleros de investigación y jóvenes investigadores. Unidad de medida: Resultados evidenciados en estudios de graduados. Fuente de datos: VI.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Formación Investigativa'' (reclasificado desde la dimensión oficial ''Impacto en Trayectorias de Vida'': Mide el efecto de semilleros/jóvenes investigadores, la misma actividad que Formación Investigativa ya cubre en Insumos/Procesos/Productos.): I01 – Estudiantes vinculados a semilleros (Insumos); I02 – Estudiantes vinculados a Proyectos (Insumos); I05 – Semilleros de investigación activos (Insumos); I08 – Tasa de Inserción Científica Avanzada (Insumos); I13 – Estudiantes de semillero reconocidos en eventos de investigación (Procesos); I14 – Jóvenes investigadores en formación (Procesos); I23 – Productos de formación en investigación de alto nivel (Maestrías/Doctorados) derivados de la ejecución de proyectos UDES (Productos).","fichaBorrador":true,"asociacionInterpretativa":"Mide el efecto de semilleros/jóvenes investigadores, la misma actividad que Formación investigativa ya cubre en Insumos/Procesos/Productos."}'::jsonb, 'publicado', 34
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I36', 'investigacion', 'impacto', false, (select id from public.imp_dimensions where fn = 'investigacion' and name = 'Investigación, creación e innovación'), u.id,
       'Índice de liderazgo y transferencia de la comunidad científica', '(N° de investigadores UDES que lideran redes internacionales, patentes concedidas o consultorías de política pública / Total de investigadores clasificados en el año t) × 100', 'Porcentaje', 'porcentaje', '', null,
       '', null, 'VI', null,
       'VI', 'VI', 'Pr3: Gobierno Institucional y transparencia Pr4: Universidad creativa y emprendedora Pr6: Impacto social integrando la enseñanza, investigación y extensión', array['C22', 'C23', 'C26']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Índice de liderazgo y transferencia de la comunidad científica», dentro de la dimensión ''Posicionamiento Institucional'' de la función de Investigación.","metodoCalculo":"Fórmula de cálculo: (N° de investigadores UDES que lideran redes internacionales, patentes concedidas o consultorías de política pública / Total de investigadores clasificados en el año t) × 100. Unidad de medida: Porcentaje. Fuente de datos: VI.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2028: VI).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Capacidad Investigativa Institucional'' (reclasificado desde la dimensión oficial ''Posicionamiento Institucional'': Rankings y liderazgo científico son la proyección externa de la capacidad instalada (profesores/grupos categorizados).): I03 – Profesores en actividades de formación investigativa (Insumos); I04 – Profesores en actividades de investigación (Insumos); I06 – Grupos de investigación activos (Insumos); I07 – Presupuesto UDES para Actividades de Ciencia, Tecnología e Innovación (ACTI) (Insumos); I09 – Efectividad en Propiedad Intelectual (Insumos); I15 – Profesores reconocidos y categorizados ante MinCiencias (Procesos); I16 – Grupos reconocidos y categorizados ante MinCiencias en A1 y A (Procesos); I21 – Productos de nuevo conocimiento derivado de la ejecución de proyectos UDES (Productos).","fichaBorrador":true,"asociacionInterpretativa":"Rankings y liderazgo científico son la proyección externa de la capacidad instalada (profesores/grupos categorizados)."}'::jsonb, 'publicado', 35
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'I37', 'investigacion', 'impacto', true, null, u.id,
       'Percepción de la comunidad institucional sobre la coherencia entre la identidad declarada y los resultados de docencia, investigación, extensión y bienestar', 'Calificación promedio obtenida en la encuesta institucional aplicada a estudiantes, profesores, personal administrativo y graduados sobre la coherencia entre la identidad declarada y los resultados de las funciones sustantivas y el bienestar.', 'Puntaje 1-5', 'numero', '', null,
       'Por definir', null, 'Por definir', null,
       'Encuesta institucional de percepción / Informes de autoevaluación institucional', 'Vicerrectorías de Enseñanza, Extensión e Investigaciones/Dirección de Autorregulación', 'Por definir', array[]::text[], '{"objetivo":"Evidenciar el efecto o cambio atribuible — indicador incorporado para cerrar una brecha identificada frente al Acuerdo 01/2025 CESU en relación con «Percepción de la comunidad institucional sobre la coherencia entre la identidad declarada y los resultados de docencia, investigación, extensión y bienestar», dentro de la dimensión Por definir de la función de Investigación.","metodoCalculo":"Registro/conteo directo a partir de: Calificación promedio obtenida en la encuesta institucional aplicada a estudiantes, profesores, personal administrativo y graduados sobre la coherencia entre la identidad declarada y los resultados de las funciones sustantivas y el bienestar. Unidad de medida: Puntaje 1-5. Fuente de datos: Encuesta institucional de percepción / Informes de autoevaluación institucional.","interpretacion":"Escala de percepción/calificación (ver rango de la unidad, ej. 1 a 5): valores más altos reflejan mejor percepción o satisfacción. Se compara contra las metas institucionales (meta 2026: Por definir; meta 2028: Por definir).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Indicador transversal (nodo central): no tiene un antecedente propio dentro de esta función porque su naturaleza es transversal a Investigación, Enseñanza y Extensión, incluyendo Bienestar Institucional. Se conecta con los 33 indicadores oficiales de Impacto Real a través del nodo central del Mapa de Red de la herramienta.","origen":"Brecha Acuerdo 01/2025 – Diagnóstico de Impacto Institucional","fichaBorrador":true,"transversal":true}'::jsonb, 'publicado', 36
  from public.units u where u.code = 'VI'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E01', 'ensenanza', 'insumos', false, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Práctica Profesional'), u.id,
       'Profesores con título de Maestría y Doctorado', 'Porcentaje del cuerpo docente con título de especialización, maestría o doctorado.', '% docentes', 'porcentaje', '69%', 69,
       '72%', 72, '75%', 75,
       'Sistema de información UDES', 'Vicerrectoría Enseñanza / RRHH', 'Proyecto 1 Proyecto 4', array[]::text[], '{"objetivo":"Cuantificar los recursos y condiciones de partida disponibles en relación con «Profesores con título de Maestría y Doctorado», dentro de la dimensión ''Práctica Profesoral'' de la función de Enseñanza.","metodoCalculo":"Registro/conteo directo a partir de: Porcentaje del cuerpo docente con título de especialización, maestría o doctorado. Unidad de medida: % docentes. Fuente de datos: Sistema de información UDES.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: 72%; meta 2028: 75%).","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true,"lineaBaseSugerida":"0.69"}'::jsonb, 'publicado', 37
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E02', 'ensenanza', 'insumos', false, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Práctica Profesional'), u.id,
       'Perfil Profesor de Posgrados', '(N° Profesores con Ph.D. o Subespecialidad / Total Profesores Posgrado) × 100', '% docentes', 'porcentaje', '16%', 16,
       '≥+2% vs LB', null, '≥+3% vs LB', null,
       'Sistema de información UDES', 'Vicerrectoría Enseñanza / RRHH / Vicerrectoria de Posgrados', 'Proyecto 1 Proyecto 5', array[]::text[], '{"objetivo":"Cuantificar los recursos y condiciones de partida disponibles en relación con «Perfil Profesor de Posgrados», dentro de la dimensión ''Práctica Profesoral'' de la función de Enseñanza.","metodoCalculo":"Fórmula de cálculo: (N° Profesores con Ph.D. o Subespecialidad / Total Profesores Posgrado) × 100. Unidad de medida: % docentes. Fuente de datos: Sistema de información UDES.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: ≥+2% vs LB; meta 2028: ≥+3% vs LB).","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true,"lineaBaseSugerida":"0.16"}'::jsonb, 'publicado', 38
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E03', 'ensenanza', 'procesos', false, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Permanencia'), u.id,
       'Estudiantes beneficiados por el programa de acompañamiento institucional (PAIPE)', 'Número de estudiantes que participan en programas de tutoría académica, asesorías psicopedagógicas, nivelación y apoyo integral por período académico.', 'N° estudiantes/semestre', 'numero', '', null,
       '+20% vs LB', null, '+50% vs LB', null,
       'Informes de desarrollo estudiantil / Informes Bienestar', 'Vicerrectoría Enseñanza / Bienestar Institucional', 'Proyecto 1 Proyecto 3', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Estudiantes beneficiados por el programa de acompañamiento institucional (PAIPE)», dentro de la dimensión ''Permanencia'' de la función de Enseñanza.","metodoCalculo":"Registro/conteo directo a partir de: Número de estudiantes que participan en programas de tutoría académica, asesorías psicopedagógicas, nivelación y apoyo integral por período académico. Unidad de medida: N° estudiantes/semestre. Fuente de datos: Informes de desarrollo estudiantil / Informes Bienestar.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: +20% vs LB; meta 2028: +50% vs LB).","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 39
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E04', 'ensenanza', 'procesos', false, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Permanencia'), u.id,
       'Tasa de retención estudiantil', 'Porcentaje de estudiantes que permanecen en el programa de un semestre a otro.', '% retención', 'porcentaje', '94%', 94,
       '+1 pp vs LB', null, '+2 pp vs LB', null,
       'Sistema SPADIES / Sistema de información UDES', 'Vicerrectoría Enseñanza / Bienestar', 'Proyecto 1 Proyecto 3', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Tasa de retención estudiantil», dentro de la dimensión ''Permanencia'' de la función de Enseñanza.","metodoCalculo":"Registro/conteo directo a partir de: Porcentaje de estudiantes que permanecen en el programa de un semestre a otro. Unidad de medida: % retención. Fuente de datos: Sistema SPADIES / Sistema de información UDES.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: +1 pp vs LB; meta 2028: +2 pp vs LB).","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","notaMetodologica":"Propuesta de precisión del cálculo (borrador, pendiente de validación por Planeación): la retención del año t se calcula tomando como referencia a los estudiantes matriculados en el año anterior (t-1). Sobre los matriculados del año t se descuentan los graduados y los estudiantes nuevos, para identificar cuántos provenían efectivamente del año anterior; ese resultado se compara con los matriculados en t-1. Ejemplo (aporte de la Dirección de Fisioterapia, Bucaramanga): para el resultado 2021 se toman los matriculados de 2020. La descripción actual habla de permanencia «de un semestre a otro»; falta confirmar si el corte oficial es semestral o anual.","fichaBorrador":true,"lineaBaseSugerida":"0.94"}'::jsonb, 'publicado', 40
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E05', 'ensenanza', 'procesos', false, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Permanencia'), u.id,
       'Tasa de deserción acumulada', 'Porcentaje acumulado de estudiantes que abandonan el programa antes de graduarse.', '% deserción', 'porcentaje', '48%', 48,
       'Reducir 2%', null, 'Reducir 2%', null,
       'SPADIES – MEN / UDES', 'Vicerrectoría Enseñanza', 'Proyecto 1 Proyecto 3', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Tasa de deserción acumulada», dentro de la dimensión ''Permanencia'' de la función de Enseñanza.","metodoCalculo":"Registro/conteo directo a partir de: Porcentaje acumulado de estudiantes que abandonan el programa antes de graduarse. Unidad de medida: % deserción. Fuente de datos: SPADIES – MEN / UDES.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: Reducir 2%; meta 2028: Reducir 2%).","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true,"lineaBaseSugerida":"0.48"}'::jsonb, 'publicado', 41
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E06', 'ensenanza', 'procesos', false, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Experiencia del Estudiante'), u.id,
       'Movilidad académica (saliente y entrante) Productos derivados del procesos de internacionalización', 'Número de estudiantes y docentes en intercambios nacionales e internacionales por período.', 'N° personas/año', 'numero', '', null,
       '+20% anual', null, 'Triplicar vs LB', null,
       'Dirección de Relaciones Nacionales e Internacionales', 'Vicerrectoría Enseñanza / Dirección de relacionaes nacionales e internacionales', 'Proyecto 1 Proyecto 7', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Movilidad académica (saliente y entrante) Productos derivados del procesos de internacionalización», dentro de la dimensión ''Experiencia del Estudiante'' de la función de Enseñanza.","metodoCalculo":"Registro/conteo directo a partir de: Número de estudiantes y docentes en intercambios nacionales e internacionales por período. Unidad de medida: N° personas/año. Fuente de datos: Dirección de Relaciones Nacionales e Internacionales.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: +20% anual; meta 2028: Triplicar vs LB).","periodicidad":"Anual.","fichaBorrador":true}'::jsonb, 'publicado', 42
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E07', 'ensenanza', 'procesos', false, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Práctica Profesional'), u.id,
       'Autoevaluación y evaluación profesoral', 'Porcentaje de profesores evaluados por estudiantes, pares académicos y autoevaluación con resultados documentados y planes de mejoramiento implementados por período.', '% docentes evaluados o Puntaje promedio', 'porcentaje', '', null,
       '100% / ≥4.0', null, '100% / ≥4.3', null,
       'Sistema de evaluación profesoral UDES', 'Vicerrectoría Enseñanza / Desarrollo Profesoral', 'Proyecto 1 Proyecto 4', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Autoevaluación y evaluación profesoral», dentro de la dimensión ''Práctica Profesoral'' de la función de Enseñanza.","metodoCalculo":"Registro/conteo directo a partir de: Porcentaje de profesores evaluados por estudiantes, pares académicos y autoevaluación con resultados documentados y planes de mejoramiento implementados por período. Unidad de medida: % docentes evaluados o Puntaje promedio. Fuente de datos: Sistema de evaluación profesoral UDES.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: 100% / ≥4.0; meta 2028: 100% / ≥4.3).","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true,"lineaBaseSugerida":"4.7"}'::jsonb, 'publicado', 43
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E10', 'ensenanza', 'productos', false, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Experiencia del Estudiante'), u.id,
       'Tasa de graduación oportuna', 'Porcentaje de estudiantes que se gradúan respecto a los que ingresaron en la cohorte.', '% graduación', 'porcentaje', '36%', 36,
       '+2 pp vs LB', null, '+2 pp vs LB', null,
       'SNIES – MEN / Sistema de Información UDES', 'Vicerrectoría Enseñanza / Registro y Control Académico', 'Proyecto 1', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Tasa de graduación oportuna», dentro de la dimensión ''Experiencia del Estudiante'' de la función de Enseñanza.","metodoCalculo":"Registro/conteo directo a partir de: Porcentaje de estudiantes que se gradúan respecto a los que ingresaron en la cohorte. Unidad de medida: % graduación. Fuente de datos: SNIES – MEN / Sistema de Información UDES.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: +2 pp vs LB; meta 2028: +2 pp vs LB).","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true,"lineaBaseSugerida":"0.36"}'::jsonb, 'publicado', 44
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E11', 'ensenanza', 'productos', false, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Aprendizaje'), u.id,
       'Resultados Saber Pro', 'Desempeño promedio de los estudiantes UDES en Pruebas Saber Pro vs. referente nacional.', 'Puntaje o posición nacional', 'numero', '141', 141,
       'Sobre la media nacional', null, 'Sobre la media nacional', null,
       'ICFES – Saber Pro', 'Vicerrectoría Enseñanza/Desarrollo Estudiantil', 'Proyecto 1', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Resultados Saber Pro», dentro de la dimensión ''Experiencia del Estudiante'' de la función de Enseñanza.","metodoCalculo":"Registro/conteo directo a partir de: Desempeño promedio de los estudiantes UDES en Pruebas Saber Pro vs. referente nacional. Unidad de medida: Puntaje o posición nacional. Fuente de datos: ICFES – Saber Pro.","interpretacion":"Escala de percepción/calificación (ver rango de la unidad, ej. 1 a 5): valores más altos reflejan mejor percepción o satisfacción. Se compara contra las metas institucionales (meta 2026: Sobre la media nacional; meta 2028: Sobre la media nacional).","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true,"lineaBaseSugerida":"141"}'::jsonb, 'publicado', 45
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E12', 'ensenanza', 'productos', false, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Experiencia del Estudiante'), u.id,
       'Programas académicos con acreditación CNA', 'Número de programas académicos con acreditación de alta calidad vigente del CNA / N° de programas acreditables', 'Proporción de acreditados de acreditables', 'proporcion', '0.15', 0.15,
       '0.22', 0.22, '0.25', 0.25,
       'CNA – MEN', 'Vicerrectoría Enseñanza / Autoevaluación', 'Proyecto 4 Proyecto 1', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Programas académicos con acreditación CNA», dentro de la dimensión ''Aprendizaje'' de la función de Enseñanza.","metodoCalculo":"Fórmula de cálculo: Número de programas académicos con acreditación de alta calidad vigente del CNA / N° de programas acreditables. Unidad de medida: Proporción de acreditados de acreditables. Fuente de datos: CNA – MEN.","interpretacion":"Se expresa como proporción frente a un universo de referencia. Se compara contra las metas institucionales (meta 2026: 0.22; meta 2028: 0.25).","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true,"asociacionInterpretativa":"Reclasificado a Experiencia del Estudiante por decisión editorial.","lineaBaseSugerida":"0.15"}'::jsonb, 'publicado', 46
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E13', 'ensenanza', 'productos', false, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Experiencia del Estudiante'), u.id,
       'Oferta de educación continuada y posgrado', 'Número de programas de educación continua, diplomados y posgrados activos.', 'N° programas', 'numero', '', null,
       '+10% anual', null, '+30% vs LB', null,
       'Sistema UDES / OLE', 'Vicerrectoría Posgrado / Enseñanza', 'Proyecto 1 Proyecto 7', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Oferta de educación continuada y posgrado», dentro de la dimensión ''Experiencia del Estudiante'' de la función de Enseñanza.","metodoCalculo":"Registro/conteo directo a partir de: Número de programas de educación continua, diplomados y posgrados activos. Unidad de medida: N° programas. Fuente de datos: Sistema UDES / OLE.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: +10% anual; meta 2028: +30% vs LB).","periodicidad":"Anual.","fichaBorrador":true}'::jsonb, 'publicado', 47
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E14', 'ensenanza', 'productos', false, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Experiencia del Estudiante'), u.id,
       'Innovaciones pedagógicas implementadas y documentadas', 'Número de innovaciones pedagógicas (estrategias didácticas, metodologías activas, uso de TIC en aula, proyectos interdisciplinares) formalmente documentadas, evaluadas y socializadas.', 'N° innovaciones/año', 'numero', '0', 0,
       '≥10/año', null, '≥25/año', null,
       'Repositorio institucional / Sistema de información desarrollo profesoral', 'Vicerrectoría Enseñanza / Desarrollo Profesoral/Innovación educativa', 'Proyecto 1 Proyecto 3', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Innovaciones pedagógicas implementadas y documentadas», dentro de la dimensión ''Práctica Profesoral'' de la función de Enseñanza.","metodoCalculo":"Registro/conteo directo a partir de: Número de innovaciones pedagógicas (estrategias didácticas, metodologías activas, uso de TIC en aula, proyectos interdisciplinares) formalmente documentadas, evaluadas y socializadas. Unidad de medida: N° innovaciones/año. Fuente de datos: Repositorio institucional / Sistema de información desarrollo profesoral.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: ≥10/año; meta 2028: ≥25/año).","periodicidad":"Anual.","fichaBorrador":true,"asociacionInterpretativa":"Reclasificado a Experiencia del Estudiante por decisión editorial.","lineaBaseSugerida":"0"}'::jsonb, 'publicado', 48
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E16', 'ensenanza', 'impacto', false, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Aprendizaje'), u.id,
       'Valor agregado académico', 'Incremento en el desempeño académico de los estudiantes medido por la diferencia entre resultados Saber Pro y Saber 11, ajustado por características socioeconómicas de entrada.', 'Puntos de diferencia o categoría MEN', 'numero', '', null,
       'Categoría Media-Alta', null, 'Categoría Alta', null,
       'ICFES Saber Pro y Saber 11 / Modelo valor agregado MEN', 'Vicerrectoría Enseñanza / Planeación Institucional', 'Proyecto 1', array[]::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Valor agregado académico», dentro de la dimensión ''Permanencia'' de la función de Enseñanza.","metodoCalculo":"Registro/conteo directo a partir de: Incremento en el desempeño académico de los estudiantes medido por la diferencia entre resultados Saber Pro y Saber 11, ajustado por características socioeconómicas de entrada. Unidad de medida: Puntos de diferencia o categoría MEN. Fuente de datos: ICFES Saber Pro y Saber 11 / Modelo valor agregado MEN.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: Categoría Media-Alta; meta 2028: Categoría Alta).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Permanencia'': E01 – Profesores con título de Maestría y Doctorado (Insumos); E03 – Estudiantes beneficiados por el programa de acompañamiento institucional (PAIPE) (Procesos); E04 – Tasa de retención estudiantil (Procesos); E05 – Tasa de deserción acumulada (Procesos); E10 – Tasa de graduación oportuna (Productos).","fichaBorrador":true}'::jsonb, 'publicado', 49
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E17', 'ensenanza', 'impacto', false, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Experiencia del Estudiante'), u.id,
       'Tasa de empleabilidad de graduados', 'Porcentaje de graduados que se encuentran vinculados laboralmente en cargos relacionados con su área de formación dentro de los 12 meses posteriores a su graduación.', '% empleabilidad pertinente', 'porcentaje', '75%', 75,
       '≥ 80%', null, '≥ 85%', null,
       'Seguimiento a graduados UDES / OLE', 'Vicerrectoría de Extensión / Vicerrectoría de Enseñanza.', 'Proyecto 7', array['C23', 'C39', 'C40']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Tasa de empleabilidad de graduados», dentro de la dimensión ''Permanencia'' de la función de Enseñanza.","metodoCalculo":"Registro/conteo directo a partir de: Porcentaje de graduados que se encuentran vinculados laboralmente en cargos relacionados con su área de formación dentro de los 12 meses posteriores a su graduación. Unidad de medida: % empleabilidad pertinente. Fuente de datos: Seguimiento a graduados UDES / OLE.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: ≥ 80%; meta 2028: ≥ 85%).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Permanencia'': E01 – Profesores con título de Maestría y Doctorado (Insumos); E03 – Estudiantes beneficiados por el programa de acompañamiento institucional (PAIPE) (Procesos); E04 – Tasa de retención estudiantil (Procesos); E05 – Tasa de deserción acumulada (Procesos); E10 – Tasa de graduación oportuna (Productos).","fichaBorrador":true,"lineaBaseSugerida":"0.75"}'::jsonb, 'publicado', 50
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E18', 'ensenanza', 'impacto', false, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Práctica Profesional'), u.id,
       'Percepción de empleadores sobre graduados', 'Calificación promedio dada por empleadores a las competencias de los graduados UDES.', 'Puntaje 1–5', 'numero', '4.0', 4,
       '≥ 4.0', null, '≥ 4.3', null,
       'Encuesta sistemática a empleadores seguimiento graduados o encuentas con fines de acreditación', 'Vicerrectoría Enseñanza / Graduados /Autorregulación', 'Proyecto 1 Proyecto 7', array['C39', 'C40']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Percepción de empleadores sobre graduados», dentro de la dimensión ''Permanencia'' de la función de Enseñanza.","metodoCalculo":"Registro/conteo directo a partir de: Calificación promedio dada por empleadores a las competencias de los graduados UDES. Unidad de medida: Puntaje 1–5. Fuente de datos: Encuesta sistemática a empleadores seguimiento graduados o encuentas con fines de acreditación.","interpretacion":"Escala de percepción/calificación (ver rango de la unidad, ej. 1 a 5): valores más altos reflejan mejor percepción o satisfacción. Se compara contra las metas institucionales (meta 2026: ≥ 4.0; meta 2028: ≥ 4.3).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Permanencia'': E01 – Profesores con título de Maestría y Doctorado (Insumos); E03 – Estudiantes beneficiados por el programa de acompañamiento institucional (PAIPE) (Procesos); E04 – Tasa de retención estudiantil (Procesos); E05 – Tasa de deserción acumulada (Procesos); E10 – Tasa de graduación oportuna (Productos).","fichaBorrador":true,"lineaBaseSugerida":"4"}'::jsonb, 'publicado', 51
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E19', 'ensenanza', 'impacto', false, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Práctica Profesional'), u.id,
       'Graduados en cargos de liderazgo', 'Porcentaje de graduados que ocupan cargos directivos o de toma de decisiones.', '% graduados', 'porcentaje', '7%', 7,
       '+3 pp vs LB', null, '+5 pp vs LB', null,
       'OLE / Encuesta egresados', 'Vicerrectoría Enseñanza / Graduados', 'Proyecto 1 Proyecto 7', array['C26', 'C39', 'C40']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Graduados en cargos de liderazgo», dentro de la dimensión ''Permanencia'' de la función de Enseñanza.","metodoCalculo":"Registro/conteo directo a partir de: Porcentaje de graduados que ocupan cargos directivos o de toma de decisiones. Unidad de medida: % graduados. Fuente de datos: OLE / Encuesta egresados.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: +3 pp vs LB; meta 2028: +5 pp vs LB).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Permanencia'': E01 – Profesores con título de Maestría y Doctorado (Insumos); E03 – Estudiantes beneficiados por el programa de acompañamiento institucional (PAIPE) (Procesos); E04 – Tasa de retención estudiantil (Procesos); E05 – Tasa de deserción acumulada (Procesos); E10 – Tasa de graduación oportuna (Productos).","fichaBorrador":true,"lineaBaseSugerida":"0.07"}'::jsonb, 'publicado', 52
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E20', 'ensenanza', 'impacto', false, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Experiencia del Estudiante'), u.id,
       'Impacto de la internacionalización', 'Evidencias del impacto de la internacionalización en las trayectorias de los graduados', 'N° evidencias de impacto/año', 'numero', '', null,
       '≥15 evidencias', null, '≥40 evidencias', null,
       'Repositorio institucional / Publicaciones / Informes de movilidad / Encuestas de impacto / Convenios', 'Vicerrectoría Enseñanza / Oficina de Relaciones Nacionales e Internacionales', 'Proyecto 1 Proyecto 7', array['C23', 'C26', 'C40']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Impacto de la internacionalización», dentro de la dimensión ''Experiencia del Estudiante/ Práctica Profesoral'' de la función de Enseñanza.","metodoCalculo":"Registro/conteo directo a partir de: Evidencias del impacto de la internacionalización en las trayectorias de los graduados. Unidad de medida: N° evidencias de impacto/año. Fuente de datos: Repositorio institucional / Publicaciones / Informes de movilidad / Encuestas de impacto / Convenios.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: ≥15 evidencias; meta 2028: ≥40 evidencias).","periodicidad":"Anual.","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Experiencia del Estudiante'' (reclasificado desde la dimensión oficial ''Experiencia del Estudiante/ Práctica Profesoral'': El impacto de la internacionalización tiene su antecedente directo en E06 (Movilidad académica), dentro de esta dimensión.): E01 – Profesores con título de Maestría y Doctorado (Insumos); E06 – Movilidad académica (saliente y entrante) Productos derivados del procesos de internacionalización (Procesos); E10 – Tasa de graduación oportuna (Productos); E11 – Resultados Saber Pro (Productos); E12 – Programas académicos con acreditación CNA (Productos); E13 – Oferta de educación continuada y posgrado (Productos); E14 – Innovaciones pedagógicas implementadas y documentadas (Productos).","fichaBorrador":true,"asociacionInterpretativa":"El impacto de la internacionalización tiene su antecedente directo en E06 (Movilidad académica), dentro de esta dimensión."}'::jsonb, 'publicado', 53
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E21', 'ensenanza', 'impacto', false, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Experiencia del Estudiante'), u.id,
       'Reconocimientos a graduados UDES', 'Número de distinciones, premios o reconocimientos públicos recibidos por graduados.', 'N° reconocimientos/año', 'numero', '', null,
       'Registro sistemático', null, 'Banco de casos', null,
       'Informes de gestión / Medios', 'Vicerrectoría Enseñanza / Comunicaciones', 'Proyecto 7', array['C39', 'C40']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Reconocimientos a graduados UDES», dentro de la dimensión ''Permanencia'' de la función de Enseñanza.","metodoCalculo":"Registro/conteo directo a partir de: Número de distinciones, premios o reconocimientos públicos recibidos por graduados. Unidad de medida: N° reconocimientos/año. Fuente de datos: Informes de gestión / Medios.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: Registro sistemático; meta 2028: Banco de casos).","periodicidad":"Anual.","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Permanencia'': E01 – Profesores con título de Maestría y Doctorado (Insumos); E03 – Estudiantes beneficiados por el programa de acompañamiento institucional (PAIPE) (Procesos); E04 – Tasa de retención estudiantil (Procesos); E05 – Tasa de deserción acumulada (Procesos); E10 – Tasa de graduación oportuna (Productos).","fichaBorrador":true}'::jsonb, 'publicado', 54
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E22', 'ensenanza', 'impacto', false, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Práctica Profesional'), u.id,
       'Tasa de vinculación efectiva en prácticas empresariales', 'Porcentaje de estudiantes habilitados para práctica que realizan su práctica empresarial en organizaciones del sector productivo formal, con evaluación satisfactoria por parte del empleador.', '% estudiantes en práctica', 'porcentaje', '', null,
       '≥ 80%', null, '≥ 90%', null,
       'Convenios activos empresa–universidad Evaluaciones de desempeño del practicante', 'Vicerrectoría de Extensión / Vicerrectoría de Enseñanza.', 'Proyecto 7', array['C23', 'C37']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Tasa de vinculación efectiva en prácticas empresariales», dentro de la dimensión ''Permanencia'' de la función de Enseñanza.","metodoCalculo":"Registro/conteo directo a partir de: Porcentaje de estudiantes habilitados para práctica que realizan su práctica empresarial en organizaciones del sector productivo formal, con evaluación satisfactoria por parte del empleador. Unidad de medida: % estudiantes en práctica. Fuente de datos: Convenios activos empresa–universidad Evaluaciones de desempeño del practicante.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: ≥ 80%; meta 2028: ≥ 90%).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Permanencia'': E01 – Profesores con título de Maestría y Doctorado (Insumos); E03 – Estudiantes beneficiados por el programa de acompañamiento institucional (PAIPE) (Procesos); E04 – Tasa de retención estudiantil (Procesos); E05 – Tasa de deserción acumulada (Procesos); E10 – Tasa de graduación oportuna (Productos).","fichaBorrador":true}'::jsonb, 'publicado', 55
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E23', 'ensenanza', 'impacto', true, null, u.id,
       'Percepción de la comunidad institucional sobre la coherencia entre la identidad declarada y los resultados de docencia, investigación, extensión y bienestar', 'Calificación promedio obtenida en la encuesta institucional aplicada a estudiantes, profesores, personal administrativo y graduados sobre la coherencia entre la identidad declarada y los resultados de las funciones sustantivas y el bienestar.', 'Puntaje 1-5', 'numero', '4,0', 4,
       '≥ 4,0', null, '≥ 4,0', null,
       'Encuesta institucional de percepción / Informes de autoevaluación institucional', 'Autorregulación Institucional/Bienestar Institucional', 'Por definir', array[]::text[], '{"objetivo":"Evidenciar el efecto o cambio atribuible — indicador incorporado para cerrar una brecha identificada frente al Acuerdo 01/2025 CESU en relación con «Percepción de la comunidad institucional sobre la coherencia entre la identidad declarada y los resultados de docencia, investigación, extensión y bienestar», dentro de la dimensión Por definir de la función de Enseñanza.","metodoCalculo":"Registro/conteo directo a partir de: Calificación promedio obtenida en la encuesta institucional aplicada a estudiantes, profesores, personal administrativo y graduados sobre la coherencia entre la identidad declarada y los resultados de las funciones sustantivas y el bienestar. Unidad de medida: Puntaje 1-5. Fuente de datos: Encuesta institucional de percepción / Informes de autoevaluación institucional.","interpretacion":"Escala de percepción/calificación (ver rango de la unidad, ej. 1 a 5): valores más altos reflejan mejor percepción o satisfacción. Se compara contra las metas institucionales (meta 2026: ≥ 4,0; meta 2028: ≥ 4,0).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Indicador transversal (nodo central): no tiene un antecedente propio dentro de esta función porque su naturaleza es transversal a Investigación, Enseñanza y Extensión, incluyendo Bienestar Institucional. Se conecta con los 33 indicadores oficiales de Impacto Real a través del nodo central del Mapa de Red de la herramienta.","origen":"Brecha Acuerdo 01/2025 – Diagnóstico de Impacto Institucional","fichaBorrador":true,"transversal":true,"lineaBaseSugerida":"4"}'::jsonb, 'publicado', 56
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E24', 'ensenanza', 'impacto', true, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Práctica Profesional'), u.id,
       'Porcentaje de sesiones del máximo órgano de gobierno académico (Consejo Superior) con participación de representantes de estamentos', '(N° de sesiones realizadas con participación de representantes de estamentos / N° total de sesiones ejecutadas) × 100.', 'Porcentaje', 'porcentaje', '1', 1,
       '1', 1, '1', 1,
       'Actas del máximo órgano de gobierno / Informes de seguimiento a la implementación de decisiones', 'Vicerrectoría de Enseñanza / Secretaría General', 'Por definir', array[]::text[], '{"objetivo":"Evidenciar el efecto o cambio atribuible — indicador incorporado para cerrar una brecha identificada frente al Acuerdo 01/2025 CESU en relación con «Porcentaje de sesiones del máximo órgano de gobierno académico (Consejo Superior) con participación de representantes de estamentos», dentro de la dimensión Por definir de la función de Enseñanza.","metodoCalculo":"Fórmula de cálculo: (N° de sesiones realizadas con participación de representantes de estamentos / N° total de sesiones ejecutadas) × 100. Unidad de medida: Porcentaje. Fuente de datos: Actas del máximo órgano de gobierno / Informes de seguimiento a la implementación de decisiones.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: 1; meta 2028: 1).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Práctica Profesoral'' (reclasificado desde la dimensión oficial ''Por definir'': Gobierno académico se asocia con la gestión estratégica institucional que esta dimensión ya cubre en Procesos (E07).): E01 – Profesores con título de Maestría y Doctorado (Insumos); E02 – Perfil Profesor de Posgrados (Insumos); E07 – Autoevaluación y evaluación profesoral (Procesos); E14 – Innovaciones pedagógicas implementadas y documentadas (Productos).","origen":"Brecha Acuerdo 01/2025 – Diagnóstico de Impacto Institucional","fichaBorrador":true,"asociacionInterpretativa":"Gobierno académico se asocia con la gestión estratégica institucional que esta dimensión ya cubre en Procesos (E07).","lineaBaseSugerida":"1"}'::jsonb, 'publicado', 57
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E25', 'ensenanza', 'impacto', true, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Práctica Profesional'), u.id,
       'Porcentaje de planes de mejoramiento derivados de autoevaluación institucional con seguimiento documentado a su efecto', '(N° de planes de mejoramiento derivados de la autoevaluación institucional con evidencia documentada / N° total de planes de mejoramiento formulados) × 100.', 'Porcentaje', 'porcentaje', '', null,
       'Por definir', null, 'Por definir', null,
       'Informes de autoevaluación institucional / Planes de mejoramiento y reportes de seguimiento', 'Vicerrectoría de Enseñanza / Dirección de Autorregulación', 'Por definir', array[]::text[], '{"objetivo":"Evidenciar el efecto o cambio atribuible — indicador incorporado para cerrar una brecha identificada frente al Acuerdo 01/2025 CESU en relación con «Porcentaje de planes de mejoramiento derivados de autoevaluación institucional con seguimiento documentado a su efecto», dentro de la dimensión Por definir de la función de Enseñanza.","metodoCalculo":"Fórmula de cálculo: (N° de planes de mejoramiento derivados de la autoevaluación institucional con evidencia documentada / N° total de planes de mejoramiento formulados) × 100. Unidad de medida: Porcentaje. Fuente de datos: Informes de autoevaluación institucional / Planes de mejoramiento y reportes de seguimiento.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: Por definir; meta 2028: Por definir).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","notaMetodologica":"La definición metodológica rigurosa de ''efecto'' para este indicador (método de atribución causal, grupo de comparación, línea base) depende de un modelo institucional de evaluación de impacto que la dependencia responsable aún tiene pendiente de formalizar. Mientras tanto, se reporta la medición operativa implícita en la fórmula/descripción del indicador, sin inferencia causal validada. Propuesta de reformulación (borrador, pendiente de validación): dado que cada programa suele tener un único plan de mejoramiento que agrupa varios proyectos, se sugiere medir cuántos proyectos incluye el plan de mejoramiento del programa, en lugar de un porcentaje de planes. La fórmula vigente no se modifica hasta que se valide.","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Práctica Profesoral'' (reclasificado desde la dimensión oficial ''Por definir'': Autoevaluación institucional se asocia con la gestión estratégica institucional que esta dimensión ya cubre en Procesos (E07).): E01 – Profesores con título de Maestría y Doctorado (Insumos); E02 – Perfil Profesor de Posgrados (Insumos); E07 – Autoevaluación y evaluación profesoral (Procesos); E14 – Innovaciones pedagógicas implementadas y documentadas (Productos).","origen":"Brecha Acuerdo 01/2025 – Diagnóstico de Impacto Institucional","fichaBorrador":true,"asociacionInterpretativa":"Autoevaluación institucional se asocia con la gestión estratégica institucional que esta dimensión ya cubre en Procesos (E07)."}'::jsonb, 'publicado', 58
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E26', 'ensenanza', 'impacto', true, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Experiencia del Estudiante'), u.id,
       'Número de programas o proyectos académicos inter/transdisciplinares implementados en respuesta a necesidades del contexto', 'Número de programas o proyectos académicos de carácter inter o transdisciplinar implementados en el periodo, con evidencia de la necesidad del contexto que atienden y de los resultados obtenidos.', 'N° programas o proyectos/año', 'numero', '', null,
       'Por definir', null, 'Por definir', null,
       'Actos de creación y aprobación de programas y proyectos / Informes de gestión académica / Estudios de contexto', 'Vicerrectoría de Enseñanza / UPARC / Planeación Institucional', 'Por definir', array[]::text[], '{"objetivo":"Evidenciar el efecto o cambio atribuible — indicador incorporado para cerrar una brecha identificada frente al Acuerdo 01/2025 CESU en relación con «Número de programas o proyectos académicos inter/transdisciplinares implementados en respuesta a necesidades del contexto», dentro de la dimensión Por definir de la función de Enseñanza.","metodoCalculo":"Registro/conteo directo a partir de: Número de programas o proyectos académicos de carácter inter o transdisciplinar implementados en el periodo, con evidencia de la necesidad del contexto que atienden y de los resultados obtenidos. Unidad de medida: N° programas o proyectos/año. Fuente de datos: Actos de creación y aprobación de programas y proyectos / Informes de gestión académica / Estudios de contexto.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: Por definir; meta 2028: Por definir).","periodicidad":"Anual.","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Experiencia del Estudiante'' (reclasificado desde la dimensión oficial ''Por definir'': Programas/proyectos inter-transdisciplinares son afines a E13 (oferta de educación continuada y posgrado).): E01 – Profesores con título de Maestría y Doctorado (Insumos); E06 – Movilidad académica (saliente y entrante) Productos derivados del procesos de internacionalización (Procesos); E10 – Tasa de graduación oportuna (Productos); E11 – Resultados Saber Pro (Productos); E12 – Programas académicos con acreditación CNA (Productos); E13 – Oferta de educación continuada y posgrado (Productos); E14 – Innovaciones pedagógicas implementadas y documentadas (Productos).","origen":"Brecha Acuerdo 01/2025 – Diagnóstico de Impacto Institucional","fichaBorrador":true,"asociacionInterpretativa":"Programas/proyectos inter-transdisciplinares son afines a E13 (oferta de educación continuada y posgrado)."}'::jsonb, 'publicado', 59
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E27', 'ensenanza', 'impacto', true, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Práctica Profesional'), u.id,
       'Incidencia de la estabilidad y renovación de la planta profesoral en los resultados institucionales de docencia, investigación y extensión', 'Relación entre los indicadores de estabilidad y renovación de la planta profesoral (permanencia, tipo de vinculación, relevo generacional) y los resultados institucionales de docencia, investigación y extensión en el periodo.', 'Índice o Análisis de correlación', 'numero', '', null,
       'Por definir', null, 'Por definir', null,
       'Sistema de información de talento humano / Informes de gestión de las tres funciones sustantivas', 'Vicerrectoría de Enseñanza / Gestión Humana', 'Por definir', array[]::text[], '{"objetivo":"Evidenciar el efecto o cambio atribuible — indicador incorporado para cerrar una brecha identificada frente al Acuerdo 01/2025 CESU en relación con «Incidencia de la estabilidad y renovación de la planta profesoral en los resultados institucionales de docencia, investigación y extensión», dentro de la dimensión Por definir de la función de Enseñanza.","metodoCalculo":"Registro/conteo directo a partir de: Relación entre los indicadores de estabilidad y renovación de la planta profesoral (permanencia, tipo de vinculación, relevo generacional) y los resultados institucionales de docencia, investigación y extensión en el periodo. Unidad de medida: Índice o Análisis de correlación. Fuente de datos: Sistema de información de talento humano / Informes de gestión de las tres funciones sustantivas.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: Por definir; meta 2028: Por definir).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Práctica Profesoral'' (reclasificado desde la dimensión oficial ''Por definir'': Estabilidad de planta profesoral se asocia directamente con esta dimensión (E01/E02 Insumos, E07 Procesos).): E01 – Profesores con título de Maestría y Doctorado (Insumos); E02 – Perfil Profesor de Posgrados (Insumos); E07 – Autoevaluación y evaluación profesoral (Procesos); E14 – Innovaciones pedagógicas implementadas y documentadas (Productos).","origen":"Brecha Acuerdo 01/2025 – Diagnóstico de Impacto Institucional","fichaBorrador":true,"asociacionInterpretativa":"Estabilidad de planta profesoral se asocia directamente con esta dimensión (E01/E02 Insumos, E07 Procesos)."}'::jsonb, 'publicado', 60
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E28', 'ensenanza', 'impacto', true, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Permanencia'), u.id,
       'Efecto de los mecanismos de permanencia estudiantil en las tasas de permanencia y graduación', 'N° de estudiantes que permanecieron y se graduaron luego de aplicárseles mecanismos de permanencia (Programas de acompañamiento institucional, transferencias, homologaciones) / N° de estudiantes a los que se les aplicaron mecanismos de permanencia (Programas de acompañamiento institucional, transferencias, homologaciones) × 100', 'Porcentaje', 'porcentaje', '', null,
       'Por definir', null, '1', 1,
       'Sistema de información académica / SPADIES / Informes de permanencia y graduación', 'Vicerrectoría de Enseñanza / Registro y Control Académico', 'Por definir', array[]::text[], '{"objetivo":"Evidenciar el efecto o cambio atribuible — indicador incorporado para cerrar una brecha identificada frente al Acuerdo 01/2025 CESU en relación con «Efecto de los mecanismos de permanencia estudiantil en las tasas de permanencia y graduación», dentro de la dimensión Por definir de la función de Enseñanza.","metodoCalculo":"Fórmula de cálculo: N° de estudiantes que permanecieron y se graduaron luego de aplicárseles mecanismos de permanencia (Programas de acompañamiento institucional, transferencias, homologaciones) / N° de estudiantes a los que se les aplicaron mecanismos de permanencia (Programas de acompañamiento institucional, transferencias, homologaciones) × 100. Unidad de medida: Porcentaje. Fuente de datos: Sistema de información académica / SPADIES / Informes de permanencia y graduación.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: Por definir; meta 2028: 1).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","notaMetodologica":"La definición metodológica rigurosa de ''efecto'' para este indicador (método de atribución causal, grupo de comparación, línea base) depende de un modelo institucional de evaluación de impacto que la dependencia responsable aún tiene pendiente de formalizar. Mientras tanto, se reporta la medición operativa implícita en la fórmula/descripción del indicador, sin inferencia causal validada. Propuesta de revisión terminológica (borrador, pendiente de validación): «efecto» es una variable difícil de expresar directamente como porcentaje; se sugiere evaluar el término «efectividad» si lo que se mide es el grado de cumplimiento o logro del resultado. El nombre vigente no se modifica hasta que se valide.","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Permanencia'' (reclasificado desde la dimensión oficial ''Por definir'': Mide el efecto de mecanismos de permanencia, el mismo tema que Permanencia ya cubre en Procesos (E03-E05).): E01 – Profesores con título de Maestría y Doctorado (Insumos); E03 – Estudiantes beneficiados por el programa de acompañamiento institucional (PAIPE) (Procesos); E04 – Tasa de retención estudiantil (Procesos); E05 – Tasa de deserción acumulada (Procesos); E10 – Tasa de graduación oportuna (Productos).","origen":"Brecha Acuerdo 01/2025 – Diagnóstico de Impacto Institucional","fichaBorrador":true,"asociacionInterpretativa":"Mide el efecto de mecanismos de permanencia, el mismo tema que Permanencia ya cubre en Procesos (E03-E05)."}'::jsonb, 'publicado', 61
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'E29', 'ensenanza', 'impacto', true, (select id from public.imp_dimensions where fn = 'ensenanza' and name = 'Permanencia'), u.id,
       'Efecto de becas o estímulos en la permanencia y graduación de estudiantes, desagregado por tipo de beca', 'N° de estudiantes que reciben becas o estímulos y permanecieron y se graduaron / N° de estudiantes que recibieron becas o estímulos × 100', 'Porcentaje', 'porcentaje', '', null,
       'Por definir', null, 'Por definir', null,
       'Registros de becas y estímulos / Sistema de información académica / Caracterización estudiantil', 'Vicerrectoría de Enseñanza / Bienestar Institucional / Crédito y Cartera', 'Por definir', array[]::text[], '{"objetivo":"Evidenciar el efecto o cambio atribuible — indicador incorporado para cerrar una brecha identificada frente al Acuerdo 01/2025 CESU en relación con «Efecto de becas o estímulos en la permanencia y graduación de estudiantes, desagregado por tipo de beca», dentro de la dimensión Por definir de la función de Enseñanza.","metodoCalculo":"Fórmula de cálculo: N° de estudiantes que reciben becas o estímulos y permanecieron y se graduaron / N° de estudiantes que recibieron becas o estímulos × 100. Unidad de medida: Porcentaje. Fuente de datos: Registros de becas y estímulos / Sistema de información académica / Caracterización estudiantil.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: Por definir; meta 2028: Por definir).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","notaMetodologica":"La definición metodológica rigurosa de ''efecto'' para este indicador (método de atribución causal, grupo de comparación, línea base) depende de un modelo institucional de evaluación de impacto que la dependencia responsable aún tiene pendiente de formalizar. Mientras tanto, se reporta la medición operativa implícita en la fórmula/descripción del indicador, sin inferencia causal validada.","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Permanencia'' (reclasificado desde la dimensión oficial ''Por definir'': Mide el efecto de becas/estímulos en permanencia, el mismo tema que Permanencia ya cubre en Procesos (E03-E05).): E01 – Profesores con título de Maestría y Doctorado (Insumos); E03 – Estudiantes beneficiados por el programa de acompañamiento institucional (PAIPE) (Procesos); E04 – Tasa de retención estudiantil (Procesos); E05 – Tasa de deserción acumulada (Procesos); E10 – Tasa de graduación oportuna (Productos).","origen":"Brecha Acuerdo 01/2025 – Diagnóstico de Impacto Institucional","fichaBorrador":true,"asociacionInterpretativa":"Mide el efecto de becas/estímulos en permanencia, el mismo tema que Permanencia ya cubre en Procesos (E03-E05)."}'::jsonb, 'publicado', 62
  from public.units u where u.code = 'VE'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X01', 'extension', 'insumos', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Institucional Formativo'), u.id,
       'Convenios activos con sector externo', 'Número de convenios vigentes con entidades públicas, empresas, comunidades y ONG para desarrollo regional', 'N° convenios', 'numero', '', null,
       '≥ 20% activos/año', null, '+50% vs LB', null,
       'Sistema de convenios UDES / Jurídica', 'Vicerrectoría Extensión', 'Proyecto 8', array[]::text[], '{"objetivo":"Cuantificar los recursos y condiciones de partida disponibles en relación con «Convenios activos con sector externo», dentro de la dimensión ''Institucional Formativo'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Número de convenios vigentes con entidades públicas, empresas, comunidades y ONG para desarrollo regional. Unidad de medida: N° convenios. Fuente de datos: Sistema de convenios UDES / Jurídica.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: ≥ 20% activos/año; meta 2028: +50% vs LB).","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 63
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X02', 'extension', 'insumos', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Mesosocial Intersectorial'), u.id,
       'Presupuesto destinado a extensión', 'Porcentaje del presupuesto institucional asignado a proyectos de extensión y proyección social', '% presupuesto', 'porcentaje', '', null,
       '+5% anual', null, 'Aumentar 20%', null,
       'Presupuesto institucional', 'Vicerrectoría Extensión / Planeación', 'Proyecto 4', array[]::text[], '{"objetivo":"Cuantificar los recursos y condiciones de partida disponibles en relación con «Presupuesto destinado a extensión», dentro de la dimensión ''Mesosocial Intersectorial'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Porcentaje del presupuesto institucional asignado a proyectos de extensión y proyección social. Unidad de medida: % presupuesto. Fuente de datos: Presupuesto institucional.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: +5% anual; meta 2028: Aumentar 20%).","periodicidad":"Anual.","fichaBorrador":true}'::jsonb, 'publicado', 64
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X03', 'extension', 'procesos', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Institucional Formativo'), u.id,
       'Municipios o territorios con presencia UDES', 'Número de municipios donde la UDES desarrolla actividades de extensión contribuyendo al desarrollo regional', 'N° municipios', 'numero', '', null,
       '+2 municipios/año', null, '≥ 5 municipios al 2028', null,
       'Informes territoriales / Actas', 'Vicerrectoría Extensión', 'Proyecto 6 Proyecto 7', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Municipios o territorios con presencia UDES», dentro de la dimensión ''Institucional Formativo'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Número de municipios donde la UDES desarrolla actividades de extensión contribuyendo al desarrollo regional. Unidad de medida: N° municipios. Fuente de datos: Informes territoriales / Actas.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: +2 municipios/año; meta 2028: ≥ 5 municipios al 2028).","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 65
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X04', 'extension', 'procesos', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Institucional Formativo'), u.id,
       'Profesores vinculados a extensión', 'Número de profesores vinculados a programas /proyectos de extensión', 'N° profesores/año', 'numero', '', null,
       '≥ 100/año', null, '≥ 100/año', null,
       'Informes de nómina', 'Vicerrectoría Extensión', 'Proyecto 4 Proyecto 6', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Profesores vinculados a extensión», dentro de la dimensión ''Institucional Formativo'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Número de profesores vinculados a programas /proyectos de extensión. Unidad de medida: N° profesores/año. Fuente de datos: Informes de nómina.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: ≥ 100/año; meta 2028: ≥ 100/año).","periodicidad":"Anual.","fichaBorrador":true}'::jsonb, 'publicado', 66
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X05', 'extension', 'procesos', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Institucional Formativo'), u.id,
       'Estudiantes y graduados vinculados a proyectos', 'Número de estudiantes de semilleros/proyectos de grado y graduados vinculados a programas/proyectos de extensión (Gestión del conocimiento)', 'N° personas/año', 'numero', '', null,
       '≥ 20/año', null, '≥ 60 acumulados', null,
       'Registros académicos / Informes', 'Vicerrectorías Extensión e Investigación', 'Proyecto 1 Proyecto 6', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Estudiantes y graduados vinculados a proyectos», dentro de la dimensión ''Institucional Formativo'' de la función de Extensión.","metodoCalculo":"Fórmula de cálculo: Número de estudiantes de semilleros/proyectos de grado y graduados vinculados a programas/proyectos de extensión (Gestión del conocimiento). Unidad de medida: N° personas/año. Fuente de datos: Registros académicos / Informes.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: ≥ 20/año; meta 2028: ≥ 60 acumulados).","periodicidad":"Anual.","fichaBorrador":true}'::jsonb, 'publicado', 67
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X06', 'extension', 'procesos', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Institucional Formativo'), u.id,
       'Emprendimientos identificados/apoyados', 'Número de emprendimientos sociales, ambientales o productivos identificados, asesorados o apoyados (Innovación y emprendimiento)', 'N° emprendimientos', 'numero', '', null,
       '≥ 10/año', null, '≥ 40 acumulados', null,
       'Informes de proyectos / Registro', 'Vicerrectoría Extensión', 'Proyecto 4 Proyecto 7', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Emprendimientos identificados/apoyados», dentro de la dimensión ''Institucional Formativo'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Número de emprendimientos sociales, ambientales o productivos identificados, asesorados o apoyados (Innovación y emprendimiento). Unidad de medida: N° emprendimientos. Fuente de datos: Informes de proyectos / Registro.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: ≥ 10/año; meta 2028: ≥ 40 acumulados).","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 68
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X07', 'extension', 'procesos', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Microsocial Territorial'), u.id,
       'Proyectos de proyección social activos', 'Número de proyectos de extensión y proyección social en ejecución vinculando ámbitos sociales y productivos', 'N° proyectos/año', 'numero', '', null,
       '+20% anual', null, 'Duplicar vs LB', null,
       'Informes de gestión extensión', 'Vicerrectoría Extensión / Facultades', 'Proyecto 6 Proyecto 7', array['C23']::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Proyectos de proyección social activos», dentro de la dimensión ''Microsocial Territorial'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Número de proyectos de extensión y proyección social en ejecución vinculando ámbitos sociales y productivos. Unidad de medida: N° proyectos/año. Fuente de datos: Informes de gestión extensión.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: +20% anual; meta 2028: Duplicar vs LB).","periodicidad":"Anual.","fichaBorrador":true}'::jsonb, 'publicado', 69
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X08', 'extension', 'procesos', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Mesosocial Intersectorial'), u.id,
       'Ingresos por servicios de extensión', 'Ingresos generados por asesorías, consultorías y servicios especializados al sector productivo', 'COP millones/año', 'pesos', '', null,
       '+10% anual', null, '+30% vs LB', null,
       'Estados financieros UDES', 'Vicerrectoría Extensión / Financiera', 'Proyecto 8', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Ingresos por servicios de extensión», dentro de la dimensión ''Mesosocial Intersectorial'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Ingresos generados por asesorías, consultorías y servicios especializados al sector productivo. Unidad de medida: COP millones/año. Fuente de datos: Estados financieros UDES.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: +10% anual; meta 2028: +30% vs LB).","periodicidad":"Anual.","fichaBorrador":true}'::jsonb, 'publicado', 70
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X09', 'extension', 'procesos', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Mesosocial Intersectorial'), u.id,
       'Percepción de apoyo institucional', 'Percepción de apoyo institucional que personas/grupos tienen frente a problemáticas desde el proyecto (Colaboración productiva)', 'Puntaje 1-5', 'numero', '', null,
       '≥ 4.0', null, '≥ 4.3', null,
       'Cuestionario de percepción', 'Vicerrectoría Extensión', 'Proyecto 7', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Percepción de apoyo institucional», dentro de la dimensión ''Mesosocial Intersectorial'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Percepción de apoyo institucional que personas/grupos tienen frente a problemáticas desde el proyecto (Colaboración productiva). Unidad de medida: Puntaje 1-5. Fuente de datos: Cuestionario de percepción.","interpretacion":"Escala de percepción/calificación (ver rango de la unidad, ej. 1 a 5): valores más altos reflejan mejor percepción o satisfacción. Se compara contra las metas institucionales (meta 2026: ≥ 4.0; meta 2028: ≥ 4.3).","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 71
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X10', 'extension', 'procesos', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Mesosocial Intersectorial'), u.id,
       'Aliados con acciones ejecutadas', 'Número de aliados institucionales con acciones ejecutadas / Número de aliados proyectados (Desarrollo redes)', '% cumplimiento', 'porcentaje', '', null,
       '≥ 70%', null, '≥ 85%', null,
       'Informes de proyectos / Convenios', 'Vicerrectoría Extensión', 'Proyecto 8', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Aliados con acciones ejecutadas», dentro de la dimensión ''Mesosocial Intersectorial'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Número de aliados institucionales con acciones ejecutadas / Número de aliados proyectados (Desarrollo redes). Unidad de medida: % cumplimiento. Fuente de datos: Informes de proyectos / Convenios.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: ≥ 70%; meta 2028: ≥ 85%).","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 72
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X11', 'extension', 'procesos', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Microsocial Territorial'), u.id,
       'Tecnologías en inventario DTT con TRL validado', 'Número de productos tecnológicos con evidencias verificadas, TRL determinado y registro en el Inventario Institucional (DESARROLLATEC)', 'N° tecnologías', 'numero', '', null,
       '', null, '', null,
       'Inventario institucional DTT (Excel/macros) / evidencias TRL', 'Coordinación DTT / Vicerrectorías Extensión e Investigación', 'Proyecto 4 Proyecto 6', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «Tecnologías en inventario DTT con TRL validado», dentro de la dimensión ''Microsocial Territorial'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Número de productos tecnológicos con evidencias verificadas, TRL determinado y registro en el Inventario Institucional (DESARROLLATEC). Unidad de medida: N° tecnologías. Fuente de datos: Inventario institucional DTT (Excel/macros) / evidencias TRL.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 73
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X12', 'extension', 'procesos', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Microsocial Territorial'), u.id,
       '% de tecnologías que aumentan TRL en el periodo', '(N° tecnologías con aumento de TRL / N° tecnologías con TRL medido) × 100. Requiere medición periódica y trazabilidad', '% tecnologías', 'porcentaje', '', null,
       '', null, '', null,
       'Informe anual DTT / Indicadores aumento de TRL', 'Coordinación DTT', 'Proyecto 4 Proyecto 6', array[]::text[], '{"objetivo":"Monitorear el avance de las actividades en ejecución en relación con «% de tecnologías que aumentan TRL en el periodo», dentro de la dimensión ''Microsocial Territorial'' de la función de Extensión.","metodoCalculo":"Fórmula de cálculo: (N° tecnologías con aumento de TRL / N° tecnologías con TRL medido) × 100. Requiere medición periódica y trazabilidad. Unidad de medida: % tecnologías. Fuente de datos: Informe anual DTT / Indicadores aumento de TRL.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 74
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X13', 'extension', 'productos', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Institucional Formativo'), u.id,
       'Espacios de participación y transferencia social del conocimiento', 'Número de espacios de participación, transferencia social del conocimiento desarrollados a partir del proyecto (Desarrollo Regional), incluyendo ferias, ruedas de negocio, jornadas de salud, foros ciudadanos y eventos de impacto social organizados por la UDES con el entorno. (Integra el indicador ''Eventos de vinculación con el entorno'')', 'N° espacios/año', 'numero', '', null,
       '≥ 10/año', null, '≥ 20/año', null,
       'Informes de proyectos / Actas', 'Vicerrectoría Extensión / Comunicaciones', 'Proyecto 6 Proyecto 7', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Espacios de participación y transferencia social del conocimiento», dentro de la dimensión ''Institucional Formativo'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Número de espacios de participación, transferencia social del conocimiento desarrollados a partir del proyecto (Desarrollo Regional), incluyendo ferias, ruedas de negocio, jornadas de salud, foros ciudadanos y eventos de impacto social organizados por la UDES con el entorno. (Integra el indicador ''Eventos de vinculación con el entorno''). Unidad de medida: N° espacios/año. Fuente de datos: Informes de proyectos / Actas.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: ≥ 10/año; meta 2028: ≥ 20/año).","periodicidad":"Anual.","fichaBorrador":true}'::jsonb, 'publicado', 75
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X14', 'extension', 'productos', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Institucional Formativo'), u.id,
       'Publicaciones derivadas de proyectos de extensión', 'Artículos, capítulos, libros sobre experiencias, sistematizaciones o resultados de proyectos de extensión', 'N° publicaciones/año', 'numero', '', null,
       '≥ 3/año', null, '≥ 10 acumuladas', null,
       'Base de datos bibliográfica UDES', 'Vicerrectorías Extensión e Investigación', 'Proyecto 7', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Publicaciones derivadas de proyectos de extensión», dentro de la dimensión ''Institucional Formativo'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Artículos, capítulos, libros sobre experiencias, sistematizaciones o resultados de proyectos de extensión. Unidad de medida: N° publicaciones/año. Fuente de datos: Base de datos bibliográfica UDES.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: ≥ 3/año; meta 2028: ≥ 10 acumuladas).","periodicidad":"Anual.","fichaBorrador":true}'::jsonb, 'publicado', 76
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X15', 'extension', 'productos', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Institucional Formativo'), u.id,
       'Nuevos proyectos de investigación surgidos', 'Número de nuevos proyectos de investigación (interna/externa) que surgen del proyecto/programa, sometidos y avalados (Innovación)', 'N° proyectos', 'numero', '', null,
       '≥ 3/año', null, '≥ 10 acumulados', null,
       'Sistema de proyectos UDES', 'Vicerrectorías Extensión e Investigación', 'Proyecto 5', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Nuevos proyectos de investigación surgidos», dentro de la dimensión ''Institucional Formativo'' de la función de Extensión.","metodoCalculo":"Fórmula de cálculo: Número de nuevos proyectos de investigación (interna/externa) que surgen del proyecto/programa, sometidos y avalados (Innovación). Unidad de medida: N° proyectos. Fuente de datos: Sistema de proyectos UDES.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: ≥ 3/año; meta 2028: ≥ 10 acumulados).","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 77
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X16', 'extension', 'productos', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Microsocial Territorial'), u.id,
       'Proyectos de aula desarrollados', 'Número de proyectos de aula desarrollados durante el proceso de implementación del proyecto/programa (Innovación)', 'N° proyectos', 'numero', '', null,
       '≥ 5/año', null, '≥ 20 acumulados', null,
       'Informes de proyectos', 'Vicerrectoría Extensión / Facultades', 'Proyecto 1 Proyecto 6', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Proyectos de aula desarrollados», dentro de la dimensión ''Microsocial Territorial'' de la función de Extensión.","metodoCalculo":"Fórmula de cálculo: Número de proyectos de aula desarrollados durante el proceso de implementación del proyecto/programa (Innovación). Unidad de medida: N° proyectos. Fuente de datos: Informes de proyectos.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: ≥ 5/año; meta 2028: ≥ 20 acumulados).","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 78
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X17', 'extension', 'productos', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Institucional Formativo'), u.id,
       'Resultados de investigación transferidos', 'Número de resultados de investigación transferidos/transferibles desde proyectos de extensión (Desarrollo Regional)', 'N° resultados', 'numero', '', null,
       '≥ 5/año', null, '≥ 15 acumulados', null,
       'Informes de proyectos / Documentos técnicos', 'Vicerrectorías Extensión e Investigación', 'Proyecto 7 Proyecto 3', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Resultados de investigación transferidos», dentro de la dimensión ''Institucional Formativo'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Número de resultados de investigación transferidos/transferibles desde proyectos de extensión (Desarrollo Regional). Unidad de medida: N° resultados. Fuente de datos: Informes de proyectos / Documentos técnicos.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: ≥ 5/año; meta 2028: ≥ 15 acumulados).","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 79
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X18', 'extension', 'productos', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Microsocial Territorial'), u.id,
       'Beneficiarios directos de proyectos', 'Número de personas, familias u organizaciones del ámbito social y productivo atendidas directamente', 'N° beneficiarios/año', 'numero', '', null,
       'Mantener o aumentar ≥ 5%/año', null, 'Triplicar vs LB', null,
       'Informes de proyectos / Actas', 'Vicerrectoría Extensión', 'Proyecto 7', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Beneficiarios directos de proyectos», dentro de la dimensión ''Microsocial Territorial'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Número de personas, familias u organizaciones del ámbito social y productivo atendidas directamente. Unidad de medida: N° beneficiarios/año. Fuente de datos: Informes de proyectos / Actas.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: Mantener o aumentar ≥ 5%/año; meta 2028: Triplicar vs LB).","periodicidad":"Anual.","fichaBorrador":true}'::jsonb, 'publicado', 80
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X19', 'extension', 'productos', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Microsocial Territorial'), u.id,
       'Programas de educación continuada ofertados', 'Diplomados, cursos de actualización ejecutados para fortalecimiento de capacidades sociales y productivas', 'N° programas/año', 'numero', '', null,
       'Mantener o aumentar ≥ 5%/año', null, '+40% vs LB', null,
       'Sistema UDES / Certificados', 'Vicerrectoría Extensión / Enseñanza', 'Proyecto 1 Proyecto 6', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Programas de educación continuada ofertados», dentro de la dimensión ''Microsocial Territorial'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Diplomados, cursos de actualización ejecutados para fortalecimiento de capacidades sociales y productivas. Unidad de medida: N° programas/año. Fuente de datos: Sistema UDES / Certificados.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: Mantener o aumentar ≥ 5%/año; meta 2028: +40% vs LB).","periodicidad":"Anual.","fichaBorrador":true}'::jsonb, 'publicado', 81
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X20', 'extension', 'productos', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Microsocial Territorial'), u.id,
       'Personas/grupos que lideran procesos territoriales', 'Porcentaje de personas, grupos, instituciones que lideran procesos en los territorios de aplicación (Vinculación social)', '% participantes', 'porcentaje', '', null,
       'Mantener o aumentar ≥ 5%/año', null, '≥ 35%', null,
       'Informes de proyectos / Seguimiento', 'Vicerrectoría Extensión', 'Proyecto 7', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Personas/grupos que lideran procesos territoriales», dentro de la dimensión ''Microsocial Territorial'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Porcentaje de personas, grupos, instituciones que lideran procesos en los territorios de aplicación (Vinculación social). Unidad de medida: % participantes. Fuente de datos: Informes de proyectos / Seguimiento.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: Mantener o aumentar ≥ 5%/año; meta 2028: ≥ 35%).","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 82
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X21', 'extension', 'productos', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Microsocial Territorial'), u.id,
       'Activos de propiedad intelectual asociados a tecnologías DTT', 'Número de activos de PI (divulgaciones, solicitudes, registros, concesiones) vinculados a productos del inventario DTT institucional', 'N° activos PI', 'numero', '', null,
       '', null, '', null,
       'Sistema/expedientes PI / Estatuto PI / registros institucionales', 'Coordinación DTT / Vicerrectoría Investigación', 'Proyecto 4 Proyecto 6', array[]::text[], '{"objetivo":"Cuantificar los resultados y productos concretos generados en relación con «Activos de propiedad intelectual asociados a tecnologías DTT», dentro de la dimensión ''Microsocial Territorial'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Número de activos de PI (divulgaciones, solicitudes, registros, concesiones) vinculados a productos del inventario DTT institucional. Unidad de medida: N° activos PI. Fuente de datos: Sistema/expedientes PI / Estatuto PI / registros institucionales.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual, con corte a diciembre de cada vigencia (a confirmar con el responsable).","fichaBorrador":true}'::jsonb, 'publicado', 83
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X22', 'extension', 'impacto', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Microsocial Territorial'), u.id,
       'Percepción de cambios favorables en problemáticas atendidas', 'Porcentaje de participantes que perciben cambios concretos favorables en las dinámicas o problemáticas atendidas (Solución de problemas)', '% participantes', 'porcentaje', '', null,
       '≥ 65%', null, '≥ 80%', null,
       'Cuestionario de percepción', 'Vicerrectoría Extensión', 'Proyecto 7', array['C23', 'C24']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Percepción de cambios favorables en problemáticas atendidas», dentro de la dimensión ''Microsocial Territorial'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Porcentaje de participantes que perciben cambios concretos favorables en las dinámicas o problemáticas atendidas (Solución de problemas). Unidad de medida: % participantes. Fuente de datos: Cuestionario de percepción.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: ≥ 65%; meta 2028: ≥ 80%).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","notaConceptual":"Esta cifra depende de un instrumento de percepción (cuestionario) cuyas categorías de respuesta y el umbral que clasifica una respuesta como favorable/positiva (o su ubicación exacta en la escala) aún no están estandarizados a nivel institucional; se recomienda que la Vicerrectoría de Extensión defina y documente el instrumento antes de comparar resultados entre periodos o proyectos.","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Microsocial Territorial'': X01 – Convenios activos con sector externo (Insumos); X07 – Proyectos de proyección social activos (Procesos); X11 – Tecnologías en inventario DTT con TRL validado (Procesos); X12 – % de tecnologías que aumentan TRL en el periodo (Procesos); X16 – Proyectos de aula desarrollados (Productos); X18 – Beneficiarios directos de proyectos (Productos); X19 – Programas de educación continuada ofertados (Productos); X20 – Personas/grupos que lideran procesos territoriales (Productos); X21 – Activos de propiedad intelectual asociados a tecnologías DTT (Productos).","fichaBorrador":true}'::jsonb, 'publicado', 84
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X23', 'extension', 'impacto', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Mesosocial Intersectorial'), u.id,
       'Satisfacción en resolución intersectorial de problemas', 'Nivel de satisfacción de los participantes o comunidad frente a la resolución interinstitucional e intersectorial de problemas desde el proyecto (Colaboración sector productivo)', 'Puntaje 1-5', 'numero', '', null,
       '≥ 4.0', null, '≥ 4.3', null,
       'Encuesta de satisfacción / Cuestionario', 'Vicerrectoría Extensión', 'Proyecto 8', array['C23', 'C26']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Satisfacción en resolución intersectorial de problemas», dentro de la dimensión ''Mesosocial Intersectorial'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Nivel de satisfacción de los participantes o comunidad frente a la resolución interinstitucional e intersectorial de problemas desde el proyecto (Colaboración sector productivo). Unidad de medida: Puntaje 1-5. Fuente de datos: Encuesta de satisfacción / Cuestionario.","interpretacion":"Escala de percepción/calificación (ver rango de la unidad, ej. 1 a 5): valores más altos reflejan mejor percepción o satisfacción. Se compara contra las metas institucionales (meta 2026: ≥ 4.0; meta 2028: ≥ 4.3).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Mesosocial Intersectorial'': X02 – Presupuesto destinado a extensión (Insumos); X08 – Ingresos por servicios de extensión (Procesos); X09 – Percepción de apoyo institucional (Procesos); X10 – Aliados con acciones ejecutadas (Procesos); X13 – Espacios de participación y transferencia social del conocimiento (Productos).","fichaBorrador":true}'::jsonb, 'publicado', 85
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X24', 'extension', 'impacto', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Microsocial Territorial'), u.id,
       'Fortalecimiento de capacidades para convivencia pacífica', 'Porcentaje de personas, familias, grupos que expresan cambios positivos en áreas de fortalecimiento de capacidades para convivencia pacífica (Promoción convivencia pacífica)', '% participantes', 'porcentaje', '', null,
       '≥ 60%', null, '≥ 75%', null,
       'Cuestionario de percepción', 'Vicerrectoría Extensión', 'Proyecto 7', array['C23', 'C24']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Fortalecimiento de capacidades para convivencia pacífica», dentro de la dimensión ''Microsocial Territorial'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Porcentaje de personas, familias, grupos que expresan cambios positivos en áreas de fortalecimiento de capacidades para convivencia pacífica (Promoción convivencia pacífica). Unidad de medida: % participantes. Fuente de datos: Cuestionario de percepción.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: ≥ 60%; meta 2028: ≥ 75%).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","notaConceptual":"Esta cifra depende de un instrumento de percepción (cuestionario) cuyas categorías de respuesta y el umbral que clasifica una respuesta como favorable/positiva (o su ubicación exacta en la escala) aún no están estandarizados a nivel institucional; se recomienda que la Vicerrectoría de Extensión defina y documente el instrumento antes de comparar resultados entre periodos o proyectos.","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Microsocial Territorial'': X01 – Convenios activos con sector externo (Insumos); X07 – Proyectos de proyección social activos (Procesos); X11 – Tecnologías en inventario DTT con TRL validado (Procesos); X12 – % de tecnologías que aumentan TRL en el periodo (Procesos); X16 – Proyectos de aula desarrollados (Productos); X18 – Beneficiarios directos de proyectos (Productos); X19 – Programas de educación continuada ofertados (Productos); X20 – Personas/grupos que lideran procesos territoriales (Productos); X21 – Activos de propiedad intelectual asociados a tecnologías DTT (Productos).","fichaBorrador":true}'::jsonb, 'publicado', 86
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X25', 'extension', 'impacto', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Microsocial Territorial'), u.id,
       'Cambios positivos en prácticas de cuidado y organización', 'Porcentaje de participantes que expresan cambios positivos en prácticas de cuidado del entorno, organización o trabajo (Vinculación ámbito social)', '% participantes', 'porcentaje', '', null,
       '≥ 60%', null, '≥ 75%', null,
       'Cuestionario de percepción', 'Vicerrectoría Extensión', 'Proyecto 7', array['C23', 'C24']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Cambios positivos en prácticas de cuidado y organización», dentro de la dimensión ''Microsocial Territorial'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Porcentaje de participantes que expresan cambios positivos en prácticas de cuidado del entorno, organización o trabajo (Vinculación ámbito social). Unidad de medida: % participantes. Fuente de datos: Cuestionario de percepción.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: ≥ 60%; meta 2028: ≥ 75%).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","notaConceptual":"Esta cifra depende de un instrumento de percepción (cuestionario) cuyas categorías de respuesta y el umbral que clasifica una respuesta como favorable/positiva (o su ubicación exacta en la escala) aún no están estandarizados a nivel institucional; se recomienda que la Vicerrectoría de Extensión defina y documente el instrumento antes de comparar resultados entre periodos o proyectos.","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Microsocial Territorial'': X01 – Convenios activos con sector externo (Insumos); X07 – Proyectos de proyección social activos (Procesos); X11 – Tecnologías en inventario DTT con TRL validado (Procesos); X12 – % de tecnologías que aumentan TRL en el periodo (Procesos); X16 – Proyectos de aula desarrollados (Productos); X18 – Beneficiarios directos de proyectos (Productos); X19 – Programas de educación continuada ofertados (Productos); X20 – Personas/grupos que lideran procesos territoriales (Productos); X21 – Activos de propiedad intelectual asociados a tecnologías DTT (Productos).","fichaBorrador":true}'::jsonb, 'publicado', 87
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X26', 'extension', 'impacto', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Microsocial Territorial'), u.id,
       'Nuevas oportunidades educativas/laborales encontradas', 'Porcentaje de participantes que encontraron nuevas oportunidades educativas, laborales, ocupacionales a partir de su participación', '% participantes', 'porcentaje', '', null,
       '≥ 40%', null, '≥ 60%', null,
       'Cuestionario de percepción / Seguimiento', 'Vicerrectoría Extensión', 'Proyecto 6 Proyecto 7', array['C23', 'C24']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Nuevas oportunidades educativas/laborales encontradas», dentro de la dimensión ''Microsocial Territorial'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Porcentaje de participantes que encontraron nuevas oportunidades educativas, laborales, ocupacionales a partir de su participación. Unidad de medida: % participantes. Fuente de datos: Cuestionario de percepción / Seguimiento.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: ≥ 40%; meta 2028: ≥ 60%).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","notaConceptual":"Esta cifra depende de un instrumento de percepción (cuestionario) cuyas categorías de respuesta y el umbral que clasifica una respuesta como favorable/positiva (o su ubicación exacta en la escala) aún no están estandarizados a nivel institucional; se recomienda que la Vicerrectoría de Extensión defina y documente el instrumento antes de comparar resultados entre periodos o proyectos.","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Microsocial Territorial'': X01 – Convenios activos con sector externo (Insumos); X07 – Proyectos de proyección social activos (Procesos); X11 – Tecnologías en inventario DTT con TRL validado (Procesos); X12 – % de tecnologías que aumentan TRL en el periodo (Procesos); X16 – Proyectos de aula desarrollados (Productos); X18 – Beneficiarios directos de proyectos (Productos); X19 – Programas de educación continuada ofertados (Productos); X20 – Personas/grupos que lideran procesos territoriales (Productos); X21 – Activos de propiedad intelectual asociados a tecnologías DTT (Productos).","fichaBorrador":true}'::jsonb, 'publicado', 88
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X27', 'extension', 'impacto', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Microsocial Territorial'), u.id,
       'Apreciación sobre aportes al bienestar', 'Apreciación de los participantes sobre los aportes, aplicaciones o efectos de los resultados sobre el bienestar (Solución problemas)', 'Puntaje 1-5', 'numero', '', null,
       '≥ 4.0', null, '≥ 4.3', null,
       'Cuestionario de percepción', 'Vicerrectoría Extensión', 'Proyecto 7', array['C23']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Apreciación sobre aportes al bienestar», dentro de la dimensión ''Microsocial Territorial'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Apreciación de los participantes sobre los aportes, aplicaciones o efectos de los resultados sobre el bienestar (Solución problemas). Unidad de medida: Puntaje 1-5. Fuente de datos: Cuestionario de percepción.","interpretacion":"Escala de percepción/calificación (ver rango de la unidad, ej. 1 a 5): valores más altos reflejan mejor percepción o satisfacción. Se compara contra las metas institucionales (meta 2026: ≥ 4.0; meta 2028: ≥ 4.3).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","notaMetodologica":"La definición metodológica rigurosa de ''efecto'' para este indicador (método de atribución causal, grupo de comparación, línea base) depende de un modelo institucional de evaluación de impacto que la dependencia responsable aún tiene pendiente de formalizar. Mientras tanto, se reporta la medición operativa implícita en la fórmula/descripción del indicador, sin inferencia causal validada.","notaConceptual":"Esta cifra depende de un instrumento de percepción (cuestionario) cuyas categorías de respuesta y el umbral que clasifica una respuesta como favorable/positiva (o su ubicación exacta en la escala) aún no están estandarizados a nivel institucional; se recomienda que la Vicerrectoría de Extensión defina y documente el instrumento antes de comparar resultados entre periodos o proyectos.","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Microsocial Territorial'': X01 – Convenios activos con sector externo (Insumos); X07 – Proyectos de proyección social activos (Procesos); X11 – Tecnologías en inventario DTT con TRL validado (Procesos); X12 – % de tecnologías que aumentan TRL en el periodo (Procesos); X16 – Proyectos de aula desarrollados (Productos); X18 – Beneficiarios directos de proyectos (Productos); X19 – Programas de educación continuada ofertados (Productos); X20 – Personas/grupos que lideran procesos territoriales (Productos); X21 – Activos de propiedad intelectual asociados a tecnologías DTT (Productos).","fichaBorrador":true}'::jsonb, 'publicado', 89
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X28', 'extension', 'impacto', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Mesosocial Intersectorial'), u.id,
       'Valoración ampliación acciones interinstitucionales', 'Valoración de actores clave frente a ampliación/funcionamiento de acciones interinstitucionales (Desarrollo redes)', 'Puntaje 1-5', 'numero', '', null,
       '≥ 4.0', null, '≥ 4.3', null,
       'Cuestionario de percepción', 'Vicerrectoría Extensión', 'Proyecto 8', array['C23', 'C26']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Valoración ampliación acciones interinstitucionales», dentro de la dimensión ''Mesosocial Intersectorial'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Valoración de actores clave frente a ampliación/funcionamiento de acciones interinstitucionales (Desarrollo redes). Unidad de medida: Puntaje 1-5. Fuente de datos: Cuestionario de percepción.","interpretacion":"Escala de percepción/calificación (ver rango de la unidad, ej. 1 a 5): valores más altos reflejan mejor percepción o satisfacción. Se compara contra las metas institucionales (meta 2026: ≥ 4.0; meta 2028: ≥ 4.3).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","notaConceptual":"Esta cifra depende de un instrumento de percepción (cuestionario) cuyas categorías de respuesta y el umbral que clasifica una respuesta como favorable/positiva (o su ubicación exacta en la escala) aún no están estandarizados a nivel institucional; se recomienda que la Vicerrectoría de Extensión defina y documente el instrumento antes de comparar resultados entre periodos o proyectos.","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Mesosocial Intersectorial'': X02 – Presupuesto destinado a extensión (Insumos); X08 – Ingresos por servicios de extensión (Procesos); X09 – Percepción de apoyo institucional (Procesos); X10 – Aliados con acciones ejecutadas (Procesos); X13 – Espacios de participación y transferencia social del conocimiento (Productos).","fichaBorrador":true}'::jsonb, 'publicado', 90
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X29', 'extension', 'impacto', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Mesosocial Intersectorial'), u.id,
       'Pertinencia de la intervención intersectorial', 'Apreciación de participantes sobre pertinencia de intervención intersectorial en cambios incorporados (Adaptabilidad)', 'Puntaje 1-5', 'numero', '', null,
       '≥ 4.0', null, '≥ 4.3', null,
       'Cuestionario de percepción', 'Vicerrectoría Extensión', 'Proyecto 7', array['C23', 'C26']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Pertinencia de la intervención intersectorial», dentro de la dimensión ''Mesosocial Intersectorial'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Apreciación de participantes sobre pertinencia de intervención intersectorial en cambios incorporados (Adaptabilidad). Unidad de medida: Puntaje 1-5. Fuente de datos: Cuestionario de percepción.","interpretacion":"Escala de percepción/calificación (ver rango de la unidad, ej. 1 a 5): valores más altos reflejan mejor percepción o satisfacción. Se compara contra las metas institucionales (meta 2026: ≥ 4.0; meta 2028: ≥ 4.3).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","notaMetodologica":"La definición metodológica rigurosa de ''pertinencia'' para este indicador (método de atribución causal, grupo de comparación, línea base) depende de un modelo institucional de evaluación de impacto que la dependencia responsable aún tiene pendiente de formalizar. Mientras tanto, se reporta la medición operativa implícita en la fórmula/descripción del indicador, sin inferencia causal validada.","notaConceptual":"Esta cifra depende de un instrumento de percepción (cuestionario) cuyas categorías de respuesta y el umbral que clasifica una respuesta como favorable/positiva (o su ubicación exacta en la escala) aún no están estandarizados a nivel institucional; se recomienda que la Vicerrectoría de Extensión defina y documente el instrumento antes de comparar resultados entre periodos o proyectos.","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Mesosocial Intersectorial'': X02 – Presupuesto destinado a extensión (Insumos); X08 – Ingresos por servicios de extensión (Procesos); X09 – Percepción de apoyo institucional (Procesos); X10 – Aliados con acciones ejecutadas (Procesos); X13 – Espacios de participación y transferencia social del conocimiento (Productos).","fichaBorrador":true}'::jsonb, 'publicado', 91
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X30', 'extension', 'impacto', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Mesosocial Intersectorial'), u.id,
       'Calidad de servicios interinstitucionales', 'Apreciación frente a calidad de servicios interinstitucionales promovidos desde el proyecto (Fomento innovación)', 'Puntaje 1-5', 'numero', '', null,
       '≥ 4.0', null, '≥ 4.3', null,
       'Cuestionario de percepción', 'Vicerrectoría Extensión', 'Proyecto 3 Proyecto 7', array['C23', 'C26']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Calidad de servicios interinstitucionales», dentro de la dimensión ''Mesosocial Intersectorial'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Apreciación frente a calidad de servicios interinstitucionales promovidos desde el proyecto (Fomento innovación). Unidad de medida: Puntaje 1-5. Fuente de datos: Cuestionario de percepción.","interpretacion":"Escala de percepción/calificación (ver rango de la unidad, ej. 1 a 5): valores más altos reflejan mejor percepción o satisfacción. Se compara contra las metas institucionales (meta 2026: ≥ 4.0; meta 2028: ≥ 4.3).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","notaConceptual":"Esta cifra depende de un instrumento de percepción (cuestionario) cuyas categorías de respuesta y el umbral que clasifica una respuesta como favorable/positiva (o su ubicación exacta en la escala) aún no están estandarizados a nivel institucional; se recomienda que la Vicerrectoría de Extensión defina y documente el instrumento antes de comparar resultados entre periodos o proyectos.","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Mesosocial Intersectorial'': X02 – Presupuesto destinado a extensión (Insumos); X08 – Ingresos por servicios de extensión (Procesos); X09 – Percepción de apoyo institucional (Procesos); X10 – Aliados con acciones ejecutadas (Procesos); X13 – Espacios de participación y transferencia social del conocimiento (Productos).","fichaBorrador":true}'::jsonb, 'publicado', 92
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X31', 'extension', 'impacto', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Macrosocial Contextual'), u.id,
       'Proyectos alineados a ODS y Plan Regional', 'Porcentaje de proyectos que responden a ODS o prioridades del Plan de Desarrollo Departamental', '% proyectos', 'porcentaje', '', null,
       '≥ 60%', null, '≥ 80%', null,
       'Informes de proyectos', 'Vicerrectoría Extensión / Planeación', 'Proyecto 5 Proyecto 6', array['C23', 'C24']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Proyectos alineados a ODS y Plan Regional», dentro de la dimensión ''Macrosocial Contextual'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Porcentaje de proyectos que responden a ODS o prioridades del Plan de Desarrollo Departamental. Unidad de medida: % proyectos. Fuente de datos: Informes de proyectos.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: ≥ 60%; meta 2028: ≥ 80%).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Mesosocial Intersectorial'' (reclasificado desde la dimensión oficial ''Macrosocial Contextual'': Alineación a ODS/Plan Regional es la escala ampliada de las alianzas intersectoriales que esta dimensión ya mide.): X02 – Presupuesto destinado a extensión (Insumos); X08 – Ingresos por servicios de extensión (Procesos); X09 – Percepción de apoyo institucional (Procesos); X10 – Aliados con acciones ejecutadas (Procesos); X13 – Espacios de participación y transferencia social del conocimiento (Productos).","fichaBorrador":true}'::jsonb, 'publicado', 93
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X32', 'extension', 'impacto', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Macrosocial Contextual'), u.id,
       'Conservación y sostenibilidad ambiental', 'Proyectos con impacto documentado en conservación, restauración o educación ambiental', 'N° proyectos', 'numero', '', null,
       '≥ 2/año', null, '≥ 6 acumulados', null,
       'Informes UDES Verde / Entidades ambientales', 'Vicerrectoría Extensión / UDES Verde', 'Proyecto 6', array['C23', 'C24']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Conservación y sostenibilidad ambiental», dentro de la dimensión ''Macrosocial Contextual'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Proyectos con impacto documentado en conservación, restauración o educación ambiental. Unidad de medida: N° proyectos. Fuente de datos: Informes UDES Verde / Entidades ambientales.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: ≥ 2/año; meta 2028: ≥ 6 acumulados).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Mesosocial Intersectorial'' (reclasificado desde la dimensión oficial ''Macrosocial Contextual'': Sostenibilidad ambiental es la escala ampliada de las alianzas intersectoriales que esta dimensión ya mide.): X02 – Presupuesto destinado a extensión (Insumos); X08 – Ingresos por servicios de extensión (Procesos); X09 – Percepción de apoyo institucional (Procesos); X10 – Aliados con acciones ejecutadas (Procesos); X13 – Espacios de participación y transferencia social del conocimiento (Productos).","fichaBorrador":true}'::jsonb, 'publicado', 94
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X33', 'extension', 'impacto', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Microsocial Territorial'), u.id,
       'Acuerdos de transferencia tecnológica formalizados (DTT)', 'Número de acuerdos de transferencia (licencias, cesiones, co-desarrollo, contratos con cláusula de explotación) firmados en el periodo', 'N° acuerdos/año', 'numero', '', null,
       '', null, '', null,
       'Contratos/actas / Sistema de convenios', 'Coordinación DTT / Vicerrectorías', 'Proyecto 4 Proyecto 6', array['C22', 'C23']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Acuerdos de transferencia tecnológica formalizados (DTT)», dentro de la dimensión ''Microsocial Territorial'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Número de acuerdos de transferencia (licencias, cesiones, co-desarrollo, contratos con cláusula de explotación) firmados en el periodo. Unidad de medida: N° acuerdos/año. Fuente de datos: Contratos/actas / Sistema de convenios.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual.","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Microsocial Territorial'': X01 – Convenios activos con sector externo (Insumos); X07 – Proyectos de proyección social activos (Procesos); X11 – Tecnologías en inventario DTT con TRL validado (Procesos); X12 – % de tecnologías que aumentan TRL en el periodo (Procesos); X16 – Proyectos de aula desarrollados (Productos); X18 – Beneficiarios directos de proyectos (Productos); X19 – Programas de educación continuada ofertados (Productos); X20 – Personas/grupos que lideran procesos territoriales (Productos); X21 – Activos de propiedad intelectual asociados a tecnologías DTT (Productos).","fichaBorrador":true}'::jsonb, 'publicado', 95
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X34', 'extension', 'impacto', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Microsocial Territorial'), u.id,
       'Ingresos por transferencia tecnológica (licencias/regalías)', 'Ingresos anuales derivados de licencias, regalías o cesiones de tecnologías desarrolladas por la UDES a través de la Coordinación DTT', 'COP millones/año', 'pesos', '', null,
       '', null, '', null,
       'Estados financieros / Contratos de licenciamiento / Reportes de regalías', 'Coordinación DTT / Financiera / Vicerrectorías', 'Proyecto 4 Proyecto 6', array['C22', 'C23']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Ingresos por transferencia tecnológica (licencias/regalías)», dentro de la dimensión ''Microsocial Territorial'' de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Ingresos anuales derivados de licencias, regalías o cesiones de tecnologías desarrolladas por la UDES a través de la Coordinación DTT. Unidad de medida: COP millones/año. Fuente de datos: Estados financieros / Contratos de licenciamiento / Reportes de regalías.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual.","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Microsocial Territorial'': X01 – Convenios activos con sector externo (Insumos); X07 – Proyectos de proyección social activos (Procesos); X11 – Tecnologías en inventario DTT con TRL validado (Procesos); X12 – % de tecnologías que aumentan TRL en el periodo (Procesos); X16 – Proyectos de aula desarrollados (Productos); X18 – Beneficiarios directos de proyectos (Productos); X19 – Programas de educación continuada ofertados (Productos); X20 – Personas/grupos que lideran procesos territoriales (Productos); X21 – Activos de propiedad intelectual asociados a tecnologías DTT (Productos).","fichaBorrador":true}'::jsonb, 'publicado', 96
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X35', 'extension', 'impacto', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Macrosocial Contextual'), u.id,
       'Índice de sinergia territorial e innovación abierta', '(Alianzas interinstitucionales con proyectos cofinanciados que aportaron a las metas de los Planes de Desarrollo Municipal y Departamental / Total de convenios activos con el Estado, empresa o cooperación internacional) × 100', 'Porcentaje', 'porcentaje', '', null,
       '', null, '', null,
       'Sistema de convenios UDES / Informes de proyectos', 'Vicerrectoría Extensión / Planeación', 'Proyecto 5 Proyecto 6', array['C23', 'C26']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Índice de sinergia territorial e innovación abierta», dentro de la dimensión ''Macrosocial Contextual'' de la función de Extensión.","metodoCalculo":"Fórmula de cálculo: (Alianzas interinstitucionales con proyectos cofinanciados que aportaron a las metas de los Planes de Desarrollo Municipal y Departamental / Total de convenios activos con el Estado, empresa o cooperación internacional) × 100. Unidad de medida: Porcentaje. Fuente de datos: Sistema de convenios UDES / Informes de proyectos.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Mesosocial Intersectorial'' (reclasificado desde la dimensión oficial ''Macrosocial Contextual'': Sinergia territorial es la escala ampliada de las alianzas intersectoriales que esta dimensión ya mide.): X02 – Presupuesto destinado a extensión (Insumos); X08 – Ingresos por servicios de extensión (Procesos); X09 – Percepción de apoyo institucional (Procesos); X10 – Aliados con acciones ejecutadas (Procesos); X13 – Espacios de participación y transferencia social del conocimiento (Productos).","fichaBorrador":true}'::jsonb, 'publicado', 97
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X36', 'extension', 'impacto', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Microsocial Territorial'), u.id,
       'Tasa de sostenibilidad y apropiación comunitaria', '(Programas de extensión que continúan operando de manera autónoma por la comunidad/sector productivo post-intervención UDES / Total de proyectos de proyección social finalizados en los últimos 4 años) × 100', 'Porcentaje', 'porcentaje', '', null,
       '', null, '', null,
       'Informes de proyectos / Seguimiento post-intervención', 'Vicerrectoría Extensión', 'Proyecto 6 Proyecto 7', array['C23', 'C24']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Tasa de sostenibilidad y apropiación comunitaria», dentro de la dimensión ''Microsocial Territorial'' de la función de Extensión.","metodoCalculo":"Fórmula de cálculo: (Programas de extensión que continúan operando de manera autónoma por la comunidad/sector productivo post-intervención UDES / Total de proyectos de proyección social finalizados en los últimos 4 años) × 100. Unidad de medida: Porcentaje. Fuente de datos: Informes de proyectos / Seguimiento post-intervención.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Microsocial Territorial'': X01 – Convenios activos con sector externo (Insumos); X07 – Proyectos de proyección social activos (Procesos); X11 – Tecnologías en inventario DTT con TRL validado (Procesos); X12 – % de tecnologías que aumentan TRL en el periodo (Procesos); X16 – Proyectos de aula desarrollados (Productos); X18 – Beneficiarios directos de proyectos (Productos); X19 – Programas de educación continuada ofertados (Productos); X20 – Personas/grupos que lideran procesos territoriales (Productos); X21 – Activos de propiedad intelectual asociados a tecnologías DTT (Productos).","fichaBorrador":true}'::jsonb, 'publicado', 98
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X37', 'extension', 'impacto', false, (select id from public.imp_dimensions where fn = 'extension' and name = 'Institucional Formativo'), u.id,
       'Índice de retorno de pertinencia posgradual y movilidad profesional', '(Graduados de posgrado que lideran procesos de transformación institucional o innovación en sus organizaciones en los primeros cinco años de grado / Total de graduados de posgrado de la cohorte x encuestados) × 100.', 'Porcentaje', 'porcentaje', '', null,
       '', null, '', null,
       'Encuesta a graduados UDES / Sistema institucional de seguimiento a graduados', 'Vicerrectoría Extensión / Vicerrectoría Enseñanza', 'Proyecto 1 Proyecto 7', array['C39', 'C40']::text[], '{"objetivo":"Evidenciar el efecto o cambio de mediano/largo plazo atribuible en relación con «Índice de retorno de pertinencia posgradual y movilidad profesional», dentro de la dimensión ''Institucional Formativo'' de la función de Extensión.","metodoCalculo":"Fórmula de cálculo: (Graduados de posgrado que lideran procesos de transformación institucional o innovación en sus organizaciones en los primeros cinco años de grado / Total de graduados de posgrado de la cohorte x encuestados) × 100. Unidad de medida: Porcentaje. Fuente de datos: Encuesta a graduados UDES / Sistema institucional de seguimiento a graduados.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Línea base y metas pendientes de definir por el responsable.","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","notaMetodologica":"La definición metodológica rigurosa de ''pertinencia'' para este indicador (método de atribución causal, grupo de comparación, línea base) depende de un modelo institucional de evaluación de impacto que la dependencia responsable aún tiene pendiente de formalizar. Mientras tanto, se reporta la medición operativa implícita en la fórmula/descripción del indicador, sin inferencia causal validada.","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Institucional Formativo'': X01 – Convenios activos con sector externo (Insumos); X03 – Municipios o territorios con presencia UDES (Procesos); X04 – Profesores vinculados a extensión (Procesos); X05 – Estudiantes y graduados vinculados a proyectos (Procesos); X06 – Emprendimientos identificados/apoyados (Procesos); X13 – Espacios de participación y transferencia social del conocimiento (Productos); X14 – Publicaciones derivadas de proyectos de extensión (Productos); X15 – Nuevos proyectos de investigación surgidos (Productos); X17 – Resultados de investigación transferidos (Productos).","fichaBorrador":true}'::jsonb, 'publicado', 99
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X38', 'extension', 'impacto', true, null, u.id,
       'Percepción de la comunidad institucional sobre la coherencia entre la identidad declarada y los resultados de docencia, investigación, extensión y bienestar', 'Calificación promedio obtenida en la encuesta institucional aplicada a estudiantes, profesores, personal administrativo y graduados sobre la coherencia entre la identidad declarada y los resultados de las funciones sustantivas y el bienestar.', 'Puntaje 1-5', 'numero', '', null,
       'Por definir', null, 'Por definir', null,
       'Encuesta institucional de percepción / Informes de autoevaluación institucional', 'Vicerrectorías de Enseñanza, Extensión e Investigaciones / Bienestar Institucional', 'Por definir', array[]::text[], '{"objetivo":"Evidenciar el efecto o cambio atribuible — indicador incorporado para cerrar una brecha identificada frente al Acuerdo 01/2025 CESU en relación con «Percepción de la comunidad institucional sobre la coherencia entre la identidad declarada y los resultados de docencia, investigación, extensión y bienestar», dentro de la dimensión Por definir de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Calificación promedio obtenida en la encuesta institucional aplicada a estudiantes, profesores, personal administrativo y graduados sobre la coherencia entre la identidad declarada y los resultados de las funciones sustantivas y el bienestar. Unidad de medida: Puntaje 1-5. Fuente de datos: Encuesta institucional de percepción / Informes de autoevaluación institucional.","interpretacion":"Escala de percepción/calificación (ver rango de la unidad, ej. 1 a 5): valores más altos reflejan mejor percepción o satisfacción. Se compara contra las metas institucionales (meta 2026: Por definir; meta 2028: Por definir).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Indicador transversal (nodo central): no tiene un antecedente propio dentro de esta función porque su naturaleza es transversal a Investigación, Enseñanza y Extensión, incluyendo Bienestar Institucional. Se conecta con los 33 indicadores oficiales de Impacto Real a través del nodo central del Mapa de Red de la herramienta.","origen":"Brecha Acuerdo 01/2025 – Diagnóstico de Impacto Institucional","fichaBorrador":true,"transversal":true}'::jsonb, 'publicado', 100
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X39', 'extension', 'impacto', true, (select id from public.imp_dimensions where fn = 'extension' and name = 'Microsocial Territorial'), u.id,
       'Proyectos de extensión con componente de patrimonio cultural/artístico y su impacto documentado', 'Número y proporción de proyectos de extensión con componente de patrimonio cultural o artístico que cuentan con evidencia documentada de su impacto social, cultural y artístico en el territorio.', 'N° proyectos o proporción', 'dual', '', null,
       'Por definir', null, 'Por definir', null,
       'Banco de proyectos de extensión / Informes de impacto / Registros de actividades culturales y artísticas', 'Vicerrectoría de Extensión y Bienestar Institucional', 'Por definir', array[]::text[], '{"objetivo":"Evidenciar el efecto o cambio atribuible — indicador incorporado para cerrar una brecha identificada frente al Acuerdo 01/2025 CESU en relación con «Proyectos de extensión con componente de patrimonio cultural/artístico y su impacto documentado», dentro de la dimensión Por definir de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Número y proporción de proyectos de extensión con componente de patrimonio cultural o artístico que cuentan con evidencia documentada de su impacto social, cultural y artístico en el territorio. Unidad de medida: N° proyectos o proporción. Fuente de datos: Banco de proyectos de extensión / Informes de impacto / Registros de actividades culturales y artísticas.","interpretacion":"Puede registrarse como número, como proporción frente a un universo de referencia, o ambos, según lo que requiera la evaluación; conviene reportar también el número cuando la proporción pueda ocultar el tamaño real. Se compara contra las metas institucionales (meta 2026: Por definir; meta 2028: Por definir).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Microsocial Territorial'' (reclasificado desde la dimensión oficial ''Por definir'': Patrimonio cultural/artístico es impacto a nivel de participante/comunidad, igual que esta dimensión.): X01 – Convenios activos con sector externo (Insumos); X07 – Proyectos de proyección social activos (Procesos); X11 – Tecnologías en inventario DTT con TRL validado (Procesos); X12 – % de tecnologías que aumentan TRL en el periodo (Procesos); X16 – Proyectos de aula desarrollados (Productos); X18 – Beneficiarios directos de proyectos (Productos); X19 – Programas de educación continuada ofertados (Productos); X20 – Personas/grupos que lideran procesos territoriales (Productos); X21 – Activos de propiedad intelectual asociados a tecnologías DTT (Productos).","origen":"Brecha Acuerdo 01/2025 – Diagnóstico de Impacto Institucional","fichaBorrador":true,"asociacionInterpretativa":"Patrimonio cultural/artístico es impacto a nivel de participante/comunidad, igual que esta dimensión."}'::jsonb, 'publicado', 101
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X40', 'extension', 'impacto', true, (select id from public.imp_dimensions where fn = 'extension' and name = 'Microsocial Territorial'), u.id,
       'Índice de impacto de los programas de bienestar institucional en la calidad de vida de estudiantes, profesores y personal administrativo', 'Índice compuesto construido a partir de la medición de calidad de vida percibida y de la participación en políticas, programas y actividades de bienestar, aplicado a estudiantes, profesores y personal administrativo.', 'Índice o Puntaje 1-5', 'numero', '', null,
       'Por definir', null, 'Por definir', null,
       'Encuesta de calidad de vida y clima institucional / Registros de participación en programas de bienestar', 'Bienestar Institucional', 'Por definir', array[]::text[], '{"objetivo":"Evidenciar el efecto o cambio atribuible — indicador incorporado para cerrar una brecha identificada frente al Acuerdo 01/2025 CESU en relación con «Índice de impacto de los programas de bienestar institucional en la calidad de vida de estudiantes, profesores y personal administrativo», dentro de la dimensión Por definir de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Índice compuesto construido a partir de la medición de calidad de vida percibida y de la participación en políticas, programas y actividades de bienestar, aplicado a estudiantes, profesores y personal administrativo. Unidad de medida: Índice o Puntaje 1-5. Fuente de datos: Encuesta de calidad de vida y clima institucional / Registros de participación en programas de bienestar.","interpretacion":"Escala de percepción/calificación (ver rango de la unidad, ej. 1 a 5): valores más altos reflejan mejor percepción o satisfacción. Se compara contra las metas institucionales (meta 2026: Por definir; meta 2028: Por definir).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","notaConceptual":"El instrumento y la metodología para medir ''calidad de vida percibida'' (dimensiones, preguntas, ponderación) están pendientes de ser definidos y documentados por Bienestar Institucional, responsable co-titular de este indicador.","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Microsocial Territorial'' (reclasificado desde la dimensión oficial ''Por definir'': Bienestar en calidad de vida es impacto a nivel de participante/comunidad, igual que esta dimensión.): X01 – Convenios activos con sector externo (Insumos); X07 – Proyectos de proyección social activos (Procesos); X11 – Tecnologías en inventario DTT con TRL validado (Procesos); X12 – % de tecnologías que aumentan TRL en el periodo (Procesos); X16 – Proyectos de aula desarrollados (Productos); X18 – Beneficiarios directos de proyectos (Productos); X19 – Programas de educación continuada ofertados (Productos); X20 – Personas/grupos que lideran procesos territoriales (Productos); X21 – Activos de propiedad intelectual asociados a tecnologías DTT (Productos).","origen":"Brecha Acuerdo 01/2025 – Diagnóstico de Impacto Institucional","fichaBorrador":true,"asociacionInterpretativa":"Bienestar en calidad de vida es impacto a nivel de participante/comunidad, igual que esta dimensión."}'::jsonb, 'publicado', 102
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X41', 'extension', 'impacto', true, (select id from public.imp_dimensions where fn = 'extension' and name = 'Institucional Formativo'), u.id,
       'Efecto de los programas de acompañamiento psicosocial y académico en la permanencia y graduación oportuna', 'Diferencia en las tasas de permanencia y graduación oportuna entre estudiantes que participaron en los programas de acompañamiento académico, psicosocial y económico y quienes no participaron.', 'Puntos porcentuales de diferencia', 'numero', '', null,
       'Por definir', null, 'Por definir', null,
       'Registros de los programas de acompañamiento / Sistema de información académica / SPADIES', 'Bienestar Institucional / Vicerrectoría de Enseñanza/Desarrollo Estudiantil', 'Por definir', array[]::text[], '{"objetivo":"Evidenciar el efecto o cambio atribuible — indicador incorporado para cerrar una brecha identificada frente al Acuerdo 01/2025 CESU en relación con «Efecto de los programas de acompañamiento psicosocial y académico en la permanencia y graduación oportuna», dentro de la dimensión Por definir de la función de Extensión.","metodoCalculo":"Registro/conteo directo a partir de: Diferencia en las tasas de permanencia y graduación oportuna entre estudiantes que participaron en los programas de acompañamiento académico, psicosocial y económico y quienes no participaron. Unidad de medida: Puntos porcentuales de diferencia. Fuente de datos: Registros de los programas de acompañamiento / Sistema de información académica / SPADIES.","interpretacion":"Valor absoluto (conteo), acumulado o por periodo según se indique en la unidad de medida. Se compara contra las metas institucionales (meta 2026: Por definir; meta 2028: Por definir).","periodicidad":"Anual (se recomienda revisar periodicidad con el responsable; los indicadores de percepción suelen medirse 1 vez al año).","notaMetodologica":"La definición metodológica rigurosa de ''efecto'' para este indicador (método de atribución causal, grupo de comparación, línea base) depende de un modelo institucional de evaluación de impacto que la dependencia responsable aún tiene pendiente de formalizar. Mientras tanto, se reporta la medición operativa implícita en la fórmula/descripción del indicador, sin inferencia causal validada.","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Institucional Formativo'' (reclasificado desde la dimensión oficial ''Por definir'': Acompañamiento psicosocial es un proceso interno institucional, junto a X37 (retorno pertinencia posgradual), ya en esta dimensión.): X01 – Convenios activos con sector externo (Insumos); X03 – Municipios o territorios con presencia UDES (Procesos); X04 – Profesores vinculados a extensión (Procesos); X05 – Estudiantes y graduados vinculados a proyectos (Procesos); X06 – Emprendimientos identificados/apoyados (Procesos); X13 – Espacios de participación y transferencia social del conocimiento (Productos); X14 – Publicaciones derivadas de proyectos de extensión (Productos); X15 – Nuevos proyectos de investigación surgidos (Productos); X17 – Resultados de investigación transferidos (Productos).","origen":"Brecha Acuerdo 01/2025 – Diagnóstico de Impacto Institucional","fichaBorrador":true,"asociacionInterpretativa":"Acompañamiento psicosocial es un proceso interno institucional, junto a X37 (retorno pertinencia posgradual), ya en esta dimensión."}'::jsonb, 'publicado', 103
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;
insert into public.imp_indicators (code, fn, stage, suggested, dimension_id, owner_unit_id, name, description, unit_label, measure, baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num, source, responsible, projects_text, cesu, sheet, status, position)
select 'X42', 'extension', 'impacto', true, (select id from public.imp_dimensions where fn = 'extension' and name = 'Institucional Formativo'), u.id,
       'Participación de egresados en programas de educación continua o posgrado UDES derivada de las estrategias de vinculación con egresados', '(N° de egresados que se matriculan en programas de educación continua o posgrado UDES a partir de las estrategias de vinculación / N° total de egresados alcanzados por dichas estrategias) × 100.', 'Porcentaje o N° egresados/año', 'porcentaje', '', null,
       'Por definir', null, 'Por definir', null,
       'Sistema de información de egresados / Registros de matrícula de educación continua y posgrado', 'Vicerrectoría de Extensión / Oficina de Graduados', 'Por definir', array[]::text[], '{"objetivo":"Evidenciar el efecto o cambio atribuible — indicador incorporado para cerrar una brecha identificada frente al Acuerdo 01/2025 CESU en relación con «Participación de egresados en programas de educación continua o posgrado UDES derivada de las estrategias de vinculación con egresados», dentro de la dimensión Por definir de la función de Extensión.","metodoCalculo":"Fórmula de cálculo: (N° de egresados que se matriculan en programas de educación continua o posgrado UDES a partir de las estrategias de vinculación / N° total de egresados alcanzados por dichas estrategias) × 100. Unidad de medida: Porcentaje o N° egresados/año. Fuente de datos: Sistema de información de egresados / Registros de matrícula de educación continua y posgrado.","interpretacion":"Se expresa en porcentaje: valores más cercanos a la meta (o a 100%, según el caso) indican mejor desempeño. Se compara contra las metas institucionales (meta 2026: Por definir; meta 2028: Por definir).","periodicidad":"Anual.","cadenaValor":"Antecedentes en la cadena de valor institucional, dimensión ''Institucional Formativo'' (reclasificado desde la dimensión oficial ''Por definir'': Vinculación de egresados es un proceso interno institucional, junto a X37 (retorno pertinencia posgradual), ya en esta dimensión.): X01 – Convenios activos con sector externo (Insumos); X03 – Municipios o territorios con presencia UDES (Procesos); X04 – Profesores vinculados a extensión (Procesos); X05 – Estudiantes y graduados vinculados a proyectos (Procesos); X06 – Emprendimientos identificados/apoyados (Procesos); X13 – Espacios de participación y transferencia social del conocimiento (Productos); X14 – Publicaciones derivadas de proyectos de extensión (Productos); X15 – Nuevos proyectos de investigación surgidos (Productos); X17 – Resultados de investigación transferidos (Productos).","origen":"Brecha Acuerdo 01/2025 – Diagnóstico de Impacto Institucional","fichaBorrador":true,"asociacionInterpretativa":"Vinculación de egresados es un proceso interno institucional, junto a X37 (retorno pertinencia posgradual), ya en esta dimensión."}'::jsonb, 'publicado', 104
  from public.units u where u.code = 'VEX'
on conflict (code) do nothing;

-- 3. Referencias cruzadas
insert into public.imp_indicator_refs (indicator_id, dimension_id, stage, note)
select i.id, d.id, 'insumos', 'El presupuesto institucional para Actividades de Ciencia, Tecnología e Innovación es el recurso financiero que habilita directamente la formulación y presentación de proyectos a convocatorias (I10-I12).'
  from public.imp_indicators i join public.imp_dimensions d on d.fn = i.fn and d.name = 'Investigación, creación e innovación'
 where i.code = 'I07'
on conflict do nothing;
insert into public.imp_indicator_refs (indicator_id, dimension_id, stage, note)
select i.id, d.id, 'insumos', 'La propiedad intelectual protegida (patentes, registros de software, secretos industriales) es el activo previo necesario para transferir productos vía licencias (I29) y para crear emprendimientos de base científica/tecnológica (I33).'
  from public.imp_indicators i join public.imp_dimensions d on d.fn = i.fn and d.name = 'Apropiación social del conocimiento'
 where i.code = 'I09'
on conflict do nothing;
insert into public.imp_indicator_refs (indicator_id, dimension_id, stage, note)
select i.id, d.id, 'productos', 'Los productos de nuevo conocimiento (artículos, capítulos, libros) son la manifestación tangible de la capacidad instalada que esta dimensión mide en profesores (I03/I04), grupos (I06) y presupuesto (I07).'
  from public.imp_indicators i join public.imp_dimensions d on d.fn = i.fn and d.name = 'Investigación, creación e innovación'
 where i.code = 'I21'
on conflict do nothing;
insert into public.imp_indicator_refs (indicator_id, dimension_id, stage, note)
select i.id, d.id, 'procesos', 'Verificar el impacto en el sector externo antes de cerrar un proyecto es el paso previo lógico a los productos de apropiación social (I22, I24-I26): sin ese impacto verificado no hay insumo real para divulgarlo o socializarlo.'
  from public.imp_indicators i join public.imp_dimensions d on d.fn = i.fn and d.name = 'Apropiación social del conocimiento'
 where i.code = 'I17'
on conflict do nothing;
insert into public.imp_indicator_refs (indicator_id, dimension_id, stage, note)
select i.id, d.id, 'productos', 'El campo `dimension` original de E14 en la matriz oficial es precisamente "Práctica Profesional"; se reclasificó interpretativamente a Experiencia del Estudiante, pero como producto sigue siendo evidencia directa de la práctica profesional que esta dimensión mide en Insumos (E01/E02) y Procesos (E07).'
  from public.imp_indicators i join public.imp_dimensions d on d.fn = i.fn and d.name = 'Práctica Profesional'
 where i.code = 'E14'
on conflict do nothing;
insert into public.imp_indicator_refs (indicator_id, dimension_id, stage, note)
select i.id, d.id, 'productos', 'La graduación oportuna es el resultado, a nivel de producto, de los procesos de retención y reducción de deserción que esta dimensión mide (E03-E05).'
  from public.imp_indicators i join public.imp_dimensions d on d.fn = i.fn and d.name = 'Permanencia'
 where i.code = 'E10'
on conflict do nothing;
insert into public.imp_indicator_refs (indicator_id, dimension_id, stage, note)
select i.id, d.id, 'insumos', 'La cualificación docente (Maestría/Doctorado) es el insumo institucional que sostiene la calidad de la movilidad académica (E06) y los productos de esta dimensión (E10-E14).'
  from public.imp_indicators i join public.imp_dimensions d on d.fn = i.fn and d.name = 'Experiencia del Estudiante'
 where i.code = 'E01'
on conflict do nothing;
insert into public.imp_indicator_refs (indicator_id, dimension_id, stage, note)
select i.id, d.id, 'insumos', 'La cualificación docente sostiene la calidad del proceso formativo, reflejada primero en el valor agregado académico (E16) y, en cadena, en la trayectoria laboral de los graduados (E17-E22). Único indicador de Insumos disponible en Enseñanza además de E02 (específico de posgrado).'
  from public.imp_indicators i join public.imp_dimensions d on d.fn = i.fn and d.name = 'Permanencia'
 where i.code = 'E01'
on conflict do nothing;
insert into public.imp_indicator_refs (indicator_id, dimension_id, stage, note)
select i.id, d.id, 'insumos', 'La cualificación docente es el insumo que sostiene la calidad del proceso de enseñanza-aprendizaje, reflejada luego en los resultados Saber Pro (E11) y el valor agregado académico (E16). Dimensión sin ningún indicador propio de Insumos ni Procesos en la matriz vigente.'
  from public.imp_indicators i join public.imp_dimensions d on d.fn = i.fn and d.name = 'Aprendizaje'
 where i.code = 'E01'
on conflict do nothing;
insert into public.imp_indicator_refs (indicator_id, dimension_id, stage, note)
select i.id, d.id, 'procesos', 'La autoevaluación y evaluación profesoral es el proceso que garantiza la calidad de la enseñanza, antecedente directo de los resultados de aprendizaje que esta dimensión mide en Productos (E11) e Impacto Real (E16).'
  from public.imp_indicators i join public.imp_dimensions d on d.fn = i.fn and d.name = 'Aprendizaje'
 where i.code = 'E07'
on conflict do nothing;
insert into public.imp_indicator_refs (indicator_id, dimension_id, stage, note)
select i.id, d.id, 'productos', 'Los espacios de participación y transferencia social (ferias, ruedas de negocio, foros) son el resultado tangible de las alianzas intersectoriales que esta dimensión mide en Procesos (X08-X10).'
  from public.imp_indicators i join public.imp_dimensions d on d.fn = i.fn and d.name = 'Mesosocial Intersectorial'
 where i.code = 'X13'
on conflict do nothing;
insert into public.imp_indicator_refs (indicator_id, dimension_id, stage, note)
select i.id, d.id, 'insumos', 'Los convenios activos con el sector externo son el insumo que habilita los procesos de desarrollo y validación tecnológica territorial (X11-X12) y sus productos derivados (X16, X18-X21).'
  from public.imp_indicators i join public.imp_dimensions d on d.fn = i.fn and d.name = 'Microsocial Territorial'
 where i.code = 'X01'
on conflict do nothing;
insert into public.imp_indicator_refs (indicator_id, dimension_id, stage, note)
select i.id, d.id, 'impacto', 'Los productos de I+D+i+c que aportan a las metas de los ODS son la manifestación en Impacto Real de la apropiación social que esta dimensión ya mide en Productos (I22, I24): guías, cartillas y eventos que se traducen en contribuciones medibles a los ODS. Dimensión sin ningún indicador propio en Insumos, Procesos ni Impacto Real en la matriz vigente.'
  from public.imp_indicators i join public.imp_dimensions d on d.fn = i.fn and d.name = 'Apropiación social del conocimiento'
 where i.code = 'I32'
on conflict do nothing;
insert into public.imp_indicator_refs (indicator_id, dimension_id, stage, note)
select i.id, d.id, 'insumos', 'El presupuesto destinado a extensión es el recurso que habilita, a mayor escala, los proyectos alineados a ODS y sostenibilidad ambiental que esta dimensión mide en Impacto Real (X31, X32, X35). Dimensión sin ningún indicador propio en Insumos, Procesos ni Productos en la matriz vigente.'
  from public.imp_indicators i join public.imp_dimensions d on d.fn = i.fn and d.name = 'Macrosocial Contextual'
 where i.code = 'X02'
on conflict do nothing;
insert into public.imp_indicator_refs (indicator_id, dimension_id, stage, note)
select i.id, d.id, 'procesos', 'Las alianzas con acciones ejecutadas son el antecedente procesual de los proyectos alineados a ODS/Plan Regional y de sostenibilidad ambiental que esta dimensión mide en Impacto Real (X31, X32).'
  from public.imp_indicators i join public.imp_dimensions d on d.fn = i.fn and d.name = 'Macrosocial Contextual'
 where i.code = 'X10'
on conflict do nothing;
insert into public.imp_indicator_refs (indicator_id, dimension_id, stage, note)
select i.id, d.id, 'productos', 'Los resultados de investigación transferidos son el producto que, a escala regional, precede a los proyectos alineados a ODS y al índice de sinergia territorial que esta dimensión mide en Impacto Real (X31, X35).'
  from public.imp_indicators i join public.imp_dimensions d on d.fn = i.fn and d.name = 'Macrosocial Contextual'
 where i.code = 'X17'
on conflict do nothing;

-- 4. Pilares y ODS que traía la matriz
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I01' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I01' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'I01'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I01'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I02' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I02' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'I02'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I02'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I03' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I03' and p.position = 2
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'I03'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I03'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I04' and p.position = 2
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I04' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'I04'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I04'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I05' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I05' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'I05'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I05'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I06' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I06' and p.position = 4
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I06'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'I06'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I07' and p.position = 4
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I07' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I07'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'I07'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I08' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I08' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'I08'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I09' and p.position = 2
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I09' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 3, 'matriz', true from public.imp_indicators i where i.code = 'I09'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I09'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I10' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I10' and p.position = 4
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I10'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'I10'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I11' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I11' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I11'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'I11'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I12' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I12' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'I12'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I12'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I13' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I13' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'I13'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I14' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I14' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'I14'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 8, 'matriz', true from public.imp_indicators i where i.code = 'I14'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I15' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I15' and p.position = 4
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I15'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'I15'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I16' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I16' and p.position = 4
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I16'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'I16'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I17' and p.position = 2
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I17' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I17'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'I17'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I18' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I18' and p.position = 4
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I18'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'I18'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I19' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I19' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I19'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'I19'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I20' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I20' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'I20'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I20'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I21' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I21' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'I21'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I21'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I22' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I22' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'I22'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 10, 'matriz', true from public.imp_indicators i where i.code = 'I22'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'I22'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I23' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I23' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'I23'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I23'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I24' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I24' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'I24'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 11, 'matriz', true from public.imp_indicators i where i.code = 'I24'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I25' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I25' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 8, 'matriz', true from public.imp_indicators i where i.code = 'I25'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I25'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I26' and p.position = 2
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I26' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I26'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 8, 'matriz', true from public.imp_indicators i where i.code = 'I26'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I27' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I27' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'I27'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 8, 'matriz', true from public.imp_indicators i where i.code = 'I27'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I28' and p.position = 5
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I28' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 3, 'matriz', true from public.imp_indicators i where i.code = 'I28'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 2, 'matriz', true from public.imp_indicators i where i.code = 'I28'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 7, 'matriz', true from public.imp_indicators i where i.code = 'I28'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 13, 'matriz', true from public.imp_indicators i where i.code = 'I28'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I29' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I29' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I29'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 8, 'matriz', true from public.imp_indicators i where i.code = 'I29'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'I29'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I30' and p.position = 4
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I30' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 16, 'matriz', true from public.imp_indicators i where i.code = 'I30'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'I30'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I31' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I31' and p.position = 4
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'I31'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I31'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'I31'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I32' and p.position = 5
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I32' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 1, 'matriz', true from public.imp_indicators i where i.code = 'I32'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'I32'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I33' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I33' and p.position = 2
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 8, 'matriz', true from public.imp_indicators i where i.code = 'I33'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I33'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I34' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I34' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'I34'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I34'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I35' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I35' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'I35'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 8, 'matriz', true from public.imp_indicators i where i.code = 'I35'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I36' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'I36' and p.position = 4
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'I36'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'I36'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E01' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E01' and p.position = 4
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'E01'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E02' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E02' and p.position = 4
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'E02'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E03' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E03' and p.position = 2
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'E03'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 10, 'matriz', true from public.imp_indicators i where i.code = 'E03'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E04' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E04' and p.position = 2
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'E04'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 10, 'matriz', true from public.imp_indicators i where i.code = 'E04'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E05' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E05' and p.position = 2
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'E05'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 10, 'matriz', true from public.imp_indicators i where i.code = 'E05'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E06' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E06' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'E06'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'E06'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E07' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E07' and p.position = 4
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'E07'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 16, 'matriz', true from public.imp_indicators i where i.code = 'E07'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E10' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'E10'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E11' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'E11'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E12' and p.position = 4
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E12' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'E12'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 16, 'matriz', true from public.imp_indicators i where i.code = 'E12'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E13' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E13' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'E13'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 8, 'matriz', true from public.imp_indicators i where i.code = 'E13'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E14' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E14' and p.position = 2
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'E14'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'E14'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E16' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'E16'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E17' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E17' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'E17'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 8, 'matriz', true from public.imp_indicators i where i.code = 'E17'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E18' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E18' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'E18'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 8, 'matriz', true from public.imp_indicators i where i.code = 'E18'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E19' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E19' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 8, 'matriz', true from public.imp_indicators i where i.code = 'E19'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 5, 'matriz', true from public.imp_indicators i where i.code = 'E19'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E20' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E20' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'E20'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'E20'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 10, 'matriz', true from public.imp_indicators i where i.code = 'E20'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E21' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'E21'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E22' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'E22' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'E22'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 8, 'matriz', true from public.imp_indicators i where i.code = 'E22'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X01' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X01' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'X01'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 8, 'matriz', true from public.imp_indicators i where i.code = 'X01'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X02' and p.position = 4
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'X02'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X03' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 11, 'matriz', true from public.imp_indicators i where i.code = 'X03'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'X03'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X04' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'X04'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'X04'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X05' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'X05'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X06' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X06' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 8, 'matriz', true from public.imp_indicators i where i.code = 'X06'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'X06'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X07' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X07' and p.position = 5
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 1, 'matriz', true from public.imp_indicators i where i.code = 'X07'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 3, 'matriz', true from public.imp_indicators i where i.code = 'X07'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X08' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X08' and p.position = 4
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 8, 'matriz', true from public.imp_indicators i where i.code = 'X08'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'X08'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X09' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'X09'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X10' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X10' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'X10'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X11' and p.position = 2
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X11' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'X11'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'X11'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X12' and p.position = 2
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X12' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'X12'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'X12'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X13' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'X13'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 11, 'matriz', true from public.imp_indicators i where i.code = 'X13'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'X13'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X14' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'X14'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X15' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'X15'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X16' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X16' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'X16'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X17' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X17' and p.position = 2
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'X17'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X18' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 1, 'matriz', true from public.imp_indicators i where i.code = 'X18'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 10, 'matriz', true from public.imp_indicators i where i.code = 'X18'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X19' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X19' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X19' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'X19'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 8, 'matriz', true from public.imp_indicators i where i.code = 'X19'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X20' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 16, 'matriz', true from public.imp_indicators i where i.code = 'X20'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 11, 'matriz', true from public.imp_indicators i where i.code = 'X20'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X21' and p.position = 2
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X21' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X21' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'X21'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'X21'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X22' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 1, 'matriz', true from public.imp_indicators i where i.code = 'X22'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 11, 'matriz', true from public.imp_indicators i where i.code = 'X22'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X23' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X23' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'X23'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 16, 'matriz', true from public.imp_indicators i where i.code = 'X23'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X24' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 16, 'matriz', true from public.imp_indicators i where i.code = 'X24'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 5, 'matriz', true from public.imp_indicators i where i.code = 'X24'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X25' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 3, 'matriz', true from public.imp_indicators i where i.code = 'X25'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 8, 'matriz', true from public.imp_indicators i where i.code = 'X25'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X26' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X26' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'X26'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 8, 'matriz', true from public.imp_indicators i where i.code = 'X26'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X27' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 3, 'matriz', true from public.imp_indicators i where i.code = 'X27'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 11, 'matriz', true from public.imp_indicators i where i.code = 'X27'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X28' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X28' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'X28'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X29' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'X29'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X30' and p.position = 2
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X30' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'X30'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X31' and p.position = 5
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X31' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X32' and p.position = 5
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 13, 'matriz', true from public.imp_indicators i where i.code = 'X32'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 15, 'matriz', true from public.imp_indicators i where i.code = 'X32'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 6, 'matriz', true from public.imp_indicators i where i.code = 'X32'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X33' and p.position = 2
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X33' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X33' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'X33'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'X33'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X34' and p.position = 2
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X34' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X34' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 9, 'matriz', true from public.imp_indicators i where i.code = 'X34'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'X34'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X35' and p.position = 5
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X35' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 11, 'matriz', true from public.imp_indicators i where i.code = 'X35'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 17, 'matriz', true from public.imp_indicators i where i.code = 'X35'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X36' and p.position = 6
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X36' and p.position = 5
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 1, 'matriz', true from public.imp_indicators i where i.code = 'X36'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 11, 'matriz', true from public.imp_indicators i where i.code = 'X36'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X37' and p.position = 1
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, pillar_id, origin, confirmed)
select i.id, 'pilar', p.id, 'matriz', true from public.imp_indicators i, public.pillars p where i.code = 'X37' and p.position = 3
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 4, 'matriz', true from public.imp_indicators i where i.code = 'X37'
on conflict do nothing;
insert into public.imp_alignments (indicator_id, target, sdg, origin, confirmed)
select i.id, 'ods', 8, 'matriz', true from public.imp_indicators i where i.code = 'X37'
on conflict do nothing;

notify pgrst, 'reload schema';
