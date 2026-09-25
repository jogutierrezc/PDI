-- =============================================================================
-- Estructura institucional · datos de PRUEBA
--
-- NO es una migración y no se aplica en producción. Lo cargan las pruebas
-- (tests/db) sobre un Postgres en memoria; en Supabase, solo en un proyecto
-- de pruebas.
--
--   · Las tres vicerrectorías, con su función sustantiva.
--   · Una facultad de prueba con tres programas: dos de pregrado y una
--     maestría, ofertados en Bucaramanga y Cúcuta; y otra facultad con un
--     programa en Valledupar.
--   · Unas personas, cada una con su función en su unidad (jefe = Gestor,
--     editor = Contribuyente).
--
-- Los ids son fijos para que las pruebas puedan nombrarlos.
-- Requiere las migraciones hasta 0077. Idempotente.
-- =============================================================================

-- --- Personas -----------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-000000000001', 'planeacion@prueba.udes.edu.co',     '{"full_name": "Planeación de Prueba"}'),
  ('00000000-0000-4000-a000-000000000002', 'director.a@prueba.udes.edu.co',     '{"full_name": "Dirección del Programa A"}'),
  ('00000000-0000-4000-a000-000000000003', 'reportante.a@prueba.udes.edu.co',   '{"full_name": "Reportante del Programa A"}'),
  ('00000000-0000-4000-a000-000000000004', 'decano@prueba.udes.edu.co',         '{"full_name": "Decanatura de Prueba"}'),
  ('00000000-0000-4000-a000-000000000005', 'vi@prueba.udes.edu.co',             '{"full_name": "Vicerrectoría de Investigaciones"}'),
  ('00000000-0000-4000-a000-000000000006', 've@prueba.udes.edu.co',             '{"full_name": "Vicerrectoría de Enseñanza"}'),
  ('00000000-0000-4000-a000-000000000007', 'vx@prueba.udes.edu.co',             '{"full_name": "Vicerrectoría de Extensión"}'),
  ('00000000-0000-4000-a000-000000000008', 'director.otra@prueba.udes.edu.co',  '{"full_name": "Dirección de otra facultad"}')
on conflict (id) do nothing;

-- Si el disparador de auth.users no existe (proyecto donde no se pudo crear),
-- los perfiles se crean aquí.
insert into public.profiles (id, email, full_name)
select u.id, u.email, u.raw_user_meta_data ->> 'full_name'
  from auth.users u
 where u.email like '%@prueba.udes.edu.co'
on conflict (id) do nothing;

-- --- Unidades -------------------------------------------------------------------

insert into public.units (id, kind, code, name, slug, substantive_function, position) values
  ('00000000-0000-4000-b000-000000000001', 'vicerrectoria', 'PR-VI', 'Vicerrectoría de Investigaciones (prueba)', 'prueba-vi', 'investigacion', 1),
  ('00000000-0000-4000-b000-000000000002', 'vicerrectoria', 'PR-VE', 'Vicerrectoría de Enseñanza (prueba)', 'prueba-ve', 'ensenanza', 2),
  ('00000000-0000-4000-b000-000000000003', 'vicerrectoria', 'PR-VX', 'Vicerrectoría de Extensión (prueba)', 'prueba-vx', 'extension', 3)
on conflict (id) do nothing;

-- Las facultades no cuelgan de una vicerrectoría (eso es `reports_to`, 0073):
-- colgarlas le daría, por herencia, la vista de todo.
insert into public.units (id, parent_id, kind, code, name, slug, position) values
  ('00000000-0000-4000-b000-000000000010', null, 'facultad', 'PR-FAC', 'Facultad de Prueba', 'prueba-facultad', 1),
  ('00000000-0000-4000-b000-000000000020', null, 'facultad', 'PR-OTRA', 'Otra Facultad de Prueba', 'prueba-otra-facultad', 2)
on conflict (id) do nothing;

insert into public.units (id, parent_id, kind, code, name, slug, snies_code, degree_level, modality, position) values
  ('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000010', 'programa', 'PR-A', 'Programa de Prueba A', 'prueba-programa-a', '900001', 'pregrado', 'presencial', 1),
  ('00000000-0000-4000-b000-000000000012', '00000000-0000-4000-b000-000000000010', 'programa', 'PR-B', 'Programa de Prueba B', 'prueba-programa-b', '900002', 'pregrado', 'virtual', 2),
  ('00000000-0000-4000-b000-000000000013', '00000000-0000-4000-b000-000000000010', 'programa', 'PR-M', 'Maestría de Prueba', 'prueba-maestria', '900003', 'maestria', 'presencial', 3),
  ('00000000-0000-4000-b000-000000000021', '00000000-0000-4000-b000-000000000020', 'programa', 'PR-Z', 'Programa de Otra Facultad', 'prueba-programa-z', '900009', 'pregrado', 'presencial', 1)
on conflict (id) do nothing;

-- Oferta por sede: los tres programas de la facultad de prueba en Bucaramanga
-- y Cúcuta; el de la otra facultad solo en Valledupar.
insert into public.program_campuses (program_id, campus_id)
select p.id, c.id
  from (values
    ('00000000-0000-4000-b000-000000000011'::uuid, 'bucaramanga'),
    ('00000000-0000-4000-b000-000000000011'::uuid, 'cucuta'),
    ('00000000-0000-4000-b000-000000000012'::uuid, 'bucaramanga'),
    ('00000000-0000-4000-b000-000000000012'::uuid, 'cucuta'),
    ('00000000-0000-4000-b000-000000000013'::uuid, 'bucaramanga'),
    ('00000000-0000-4000-b000-000000000013'::uuid, 'cucuta'),
    ('00000000-0000-4000-b000-000000000021'::uuid, 'valledupar')
  ) as p(id, campus)
  join public.campuses c on c.slug = p.campus
on conflict do nothing;

-- --- Quién trabaja dónde ----------------------------------------------------------

insert into public.unit_members (unit_id, profile_id, role)
select m.unit_id, m.profile_id, m.unit_role::public.unit_role
  from (values
    ('00000000-0000-4000-b000-000000000011'::uuid, '00000000-0000-4000-a000-000000000002'::uuid, 'jefe'),
    ('00000000-0000-4000-b000-000000000011'::uuid, '00000000-0000-4000-a000-000000000003'::uuid, 'editor'),
    ('00000000-0000-4000-b000-000000000010'::uuid, '00000000-0000-4000-a000-000000000004'::uuid, 'jefe'),
    ('00000000-0000-4000-b000-000000000001'::uuid, '00000000-0000-4000-a000-000000000005'::uuid, 'jefe'),
    ('00000000-0000-4000-b000-000000000002'::uuid, '00000000-0000-4000-a000-000000000006'::uuid, 'jefe'),
    ('00000000-0000-4000-b000-000000000003'::uuid, '00000000-0000-4000-a000-000000000007'::uuid, 'jefe'),
    ('00000000-0000-4000-b000-000000000021'::uuid, '00000000-0000-4000-a000-000000000008'::uuid, 'jefe')
  ) as m(unit_id, profile_id, unit_role)
on conflict (unit_id, profile_id) do update set role = excluded.role;
