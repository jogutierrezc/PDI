-- =============================================================================
-- 0156 · Warehouse UDES · políticas de los reportes de las tres plataformas
--
-- Con los HAR de Master, Galileo y Davinci ya se conoce el encabezado de más
-- reportes. Esta migración añade su política de privacidad (qué columnas se
-- guardan y cuáles se reemplazan por un seudónimo; ver wh_politicas, 0155):
--
--   dv_global   Reporte global de matrículas (Davinci): materia, grupo y
--               departamento de cada estudiante. Sin nombres ni correos; el
--               código del estudiante y el del docente quedan como seudónimo.
--   ms_nom      Carga académica por docente (Master, «nómina con estado»): sin
--               nombres, correos ni observaciones; la cédula como seudónimo.
--   gl_uso      Porcentaje de uso de aulas (Galileo): sin datos personales.
--   ms_doc      Docentes (Master): solo estado, contrato y horas; la
--               identificación como seudónimo. Nunca nombre, correo, teléfono,
--               dirección ni contraseña.
--
-- Los nombres de columna son los del Excel (o de la lista JSON) normalizados:
-- sin tildes, en minúscula y con «_» (motor.ts · normalizarColumna).
-- «dv_fin» (financiero) y «dv_asp» (aspirantes) siguen sin política: el HAR no
-- mostró su encabezado. La función `warehouse` los sondea (solo nombres de
-- columnas, ninguna fila) para escribirla.
--
-- Requiere 0155. Idempotente.
-- =============================================================================

insert into public.wh_politicas (conjunto, modo, lista, seudonimizar, nota) values
  ('dv_global', 'permitir',
   '{codigo,cod_materia,grupo,materia,cod_departamento,departamento,id_docente}',
   '{codigo,id_docente}',
   'Se descartan nombres, apellidos, correos y el nombre del docente; el código del estudiante y la identificación del docente quedan como seudónimo.'),
  ('ms_nom', 'permitir',
   '{cedula,contrato,duracion,categoria,nivel_de_estudio,asignatura_actividad,tipo_de_actividad,codigo,grupo,g_fusion,programa_departamento,cod_programa,plan_de_estudio,horas_semanales,horas_semestre,nro_semanas,fecha_inicio,fecha_fin,matriculados,capacidad,estado}',
   '{cedula}',
   'Se descartan nombre, apellido, correos y observaciones; la cédula queda como seudónimo.'),
  ('gl_uso', 'excluir', '{}', '{}', 'Uso de aulas por semana, sin datos personales.'),
  ('ms_doc', 'permitir',
   '{identification,active,contract_type,total_hours_equipment,foreign_exp,updated,updated_data}',
   '{identification}',
   'Se descartan nombres, correo, teléfono, dirección, contraseña y cualquier otro dato personal; la identificación queda como seudónimo.')
on conflict (conjunto) do update
  set modo = excluded.modo, lista = excluded.lista, seudonimizar = excluded.seudonimizar, nota = excluded.nota;

notify pgrst, 'reload schema';
