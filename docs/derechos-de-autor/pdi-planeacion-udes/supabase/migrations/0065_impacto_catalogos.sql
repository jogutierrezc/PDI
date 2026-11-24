-- =============================================================================
-- PDI · 0065 · Impacto: catálogos maestros de la hoja PORTADA
--
-- Tal como los trae la matriz vr7: seis pilares, siete proyectos estratégicos
-- y los catorce ODS que la UDES declara prioritarios. Si un indicador se
-- alinea con un ODS que no está en esta lista, el importador lo reporta como
-- hallazgo; no se agrega aquí para que cuadre.
--
-- Las dimensiones y las fuentes de verificación las crea el importador a
-- partir de las hojas de cada función (fase 2).
--
-- Requiere 0064. Idempotente.
-- =============================================================================

insert into public.imp_master_catalog (kind, code, name, description, position)
values
  ('pilar', '1', 'Personalización', 'Adaptación de procesos educativos a necesidades individuales, flexibilidad curricular e innovación pedagógica.', 1),
  ('pilar', '2', 'Ambiente Tecnológico', 'Integración estratégica de TIC en educación, investigación, extensión y gestión administrativa.', 2),
  ('pilar', '3', 'Entorno Emprendedor', 'Cultura emprendedora, generación de ideas innovadoras y transferencia de conocimiento al sector productivo.', 3),
  ('pilar', '4', 'Gobernanza', 'Gestión eficiente, transparente y participativa con rendición de cuentas y cumplimiento normativo.', 4),
  ('pilar', '5', 'Sostenibilidad', 'Compromiso con cuidado ambiental, responsabilidad social y alineación con ODS de la Agenda 2030.', 5),
  ('pilar', '6', 'Apropiación Social', 'Vinculación con el entorno, impacto social de funciones sustantivas y contribución al desarrollo territorial.', 6),

  ('proyecto', 'Pr1', 'Transformación curricular', '', 1),
  ('proyecto', 'Pr2', 'Modernización y flexibilidad administrativa institucional', '', 2),
  ('proyecto', 'Pr3', 'Gobierno Institucional y Transparencia', '', 3),
  ('proyecto', 'Pr4', 'Universidad Creativa y Emprendedora', '', 4),
  ('proyecto', 'Pr5', 'Cultura universitaria de sostenibilidad', '', 5),
  ('proyecto', 'Pr6', 'Impacto social integrado de la enseñanza, investigación y extensión', '', 6),
  ('proyecto', 'Pr7', 'UDES: Universidad, empresa, estado, comunidad y sociedad civil', '', 7),

  ('ods', '1', 'Fin de la pobreza', '', 1),
  ('ods', '3', 'Salud y bienestar', '', 3),
  ('ods', '4', 'Educación de calidad', '', 4),
  ('ods', '5', 'Igualdad de género', '', 5),
  ('ods', '6', 'Agua limpia y saneamiento', '', 6),
  ('ods', '8', 'Trabajo decente y crecimiento económico', '', 8),
  ('ods', '9', 'Industria, innovación e infraestructura', '', 9),
  ('ods', '10', 'Reducción de las desigualdades', '', 10),
  ('ods', '11', 'Ciudades y comunidades sostenibles', '', 11),
  ('ods', '13', 'Acción por el clima', '', 13),
  ('ods', '14', 'Vida submarina', '', 14),
  ('ods', '15', 'Vida de ecosistemas terrestres', '', 15),
  ('ods', '16', 'Paz, justicia e instituciones sólidas', '', 16),
  ('ods', '17', 'Alianzas para lograr los objetivos', '', 17)
on conflict (kind, function_id, code) do update
  set name = excluded.name,
      description = excluded.description,
      position = excluded.position;

notify pgrst, 'reload schema';
